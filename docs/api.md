# API reference

Base URL: your deployment (default `http://localhost:4041`). Machine-readable: [`openapi.json`](https://github.com/nirholas/x402-group-pay/blob/main/openapi.json) · [`/.well-known/x402`](https://github.com/nirholas/x402-group-pay/blob/main/public/.well-known/x402).

All paid routes follow x402: unpaid request → `402` + `PaymentRequirements`; request with valid `X-PAYMENT` header → `200` + artifact + `X-PAYMENT-RESPONSE` header.

## Payment rails

Every paid route is **dual rail** — the 402 body's `accepts[]` holds one entry per rail at the same price, and the server settles whichever one your `X-PAYMENT` payload names in its `network` field.

| Rail | `network` | Asset | payTo | Facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` (default), `base` | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` (default), `solana-devnet` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

The two rails use **different facilitators** because the reference x402.org facilitator does not settle Solana mainnet. Each contribution records the facilitator that settled it. The Solana entry carries `extra.feePayer` — the facilitator account that sponsors the SOL network fee, so payers need only USDC.

**402 body**

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "1000",
      "resource": "https://host/pools", "description": "…", "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "1000",
      "resource": "https://host/pools", "description": "…", "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USD Coin", "decimals": 6, "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
  ]
}
```

**`X-PAYMENT-RESPONSE`** (on every paid `200`) is base64 JSON:

```json
{ "success": true, "rail": "solana", "network": "solana",
  "facilitator": "https://facilitator.payai.network",
  "transaction": "5xY…", "payer": "7hF…", "amount": "1000", "asset": "USDC" }
```

---

## POST /pools — $0.001

Create a group-payment pool.

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `purpose` | string | yes | What the pool funds (≤300 chars) |
| `totalUsd` | number | yes | 0.01–1000; rounded up to whole share units |
| `merchant` | string | no | Who ultimately gets paid off-band |
| `expiresInHours` | number | no | 1–720, default 72 |

**200**

```json
{
  "pool": {
    "poolId": "pool_ab12cd34ef56aa00", "purpose": "Dinner for 6", "merchant": "Luna",
    "asset": "USDC", "network": "base-sepolia | solana",
    "totalUsd": 0.06, "shareUnitUsd": 0.01, "unitsRequired": 6, "unitsPaid": 0,
    "status": "open", "contributions": [], "railBreakdown": { "evm": 0, "solana": 0, "unknown": 0 },
    "createdAt": "…", "expiresAt": "…", "fundedAt": null
  },
  "joinLinks": { "human": "…/?pool=…", "agentPay": "…/pools/…/pay", "status": "…", "proof": "…" },
  "rails": [
    { "rail": "evm", "network": "base-sepolia", "asset": "USDC", "payTo": "0x4025…2402" },
    { "rail": "solana", "network": "solana", "asset": "USDC", "payTo": "Wwwu…T3WwW" }
  ],
  "note": "Each contribution pays exactly one share unit of $0.01. 6 units fund this pool. Contributors may pay on EITHER rail…"
}
```

**Errors**: `400` invalid body (includes retry hint), `402` unpaid.

---

## POST /pools/:id/pay — $0.01 (one share unit)

Contribute one share unit. Pay on **either rail** — members of the same pool can mix. The payer wallet and rail come from the settlement receipt (falling back to the `X-PAYMENT` payload). Call k times to cover k units.

**200**

```json
{
  "receipt": {
    "payload": {
      "type": "x402-group-pay/contribution-receipt",
      "receiptId": "rcpt_1a2b3c4d5e6f7a8b", "poolId": "pool_…", "wallet": "0x…",
      "rail": "evm", "network": "base-sepolia", "settlementTx": "0x9f…",
      "facilitator": "https://x402.org/facilitator",
      "unitUsd": 0.01, "unitsPaid": 3, "unitsRequired": 6, "remainingUsd": 0.03,
      "railBreakdown": { "evm": 2, "solana": 1, "unknown": 0 },
      "poolStatus": "open", "paidAt": "…"
    },
    "signature": "hex", "algorithm": "HMAC-SHA256", "canonicalization": "sorted-json"
  }
}
```

**Errors** (payment already settled, so a signed artifact is still returned):

- `404 {"error":"pool_not_found","refundClaim":{…signed…}}`
- `409 {"error":"pool_not_open","refundClaim":{…signed…}}` — pool already funded or expired

The `refundClaim` is a signed instrument (`type: "x402-group-pay/refund-claim"`) naming the wallet, amount, and reason — present it to the pool operator for an off-band refund.

---

## GET /pools/:id — free

Live pool record: `{"pool": {…}}`. `404` if unknown.

---

## GET /pools/:id/proof — free

While open/expired:

```json
{ "status": "pending", "poolId": "…", "unitsPaid": 3, "unitsRequired": 6,
  "railBreakdown": { "evm": 2, "solana": 1, "unknown": 0 }, "remainingUsd": 0.03, "expiresAt": "…" }
```

Once funded:

```json
{
  "status": "funded",
  "proof": {
    "payload": {
      "type": "x402-group-pay/funded-proof", "poolId": "…", "purpose": "…", "merchant": "…",
      "asset": "USDC", "network": "base-sepolia | solana", "totalUsd": 0.06,
      "contributors": [
        { "wallet": "0x…", "unitUsd": 0.01, "rail": "evm", "network": "base-sepolia", "settlementTx": "0x…", "receiptId": "rcpt_…" },
        { "wallet": "7hF…", "unitUsd": 0.01, "rail": "solana", "network": "solana", "settlementTx": "5xY…", "receiptId": "rcpt_…" }
      ],
      "railBreakdown": { "evm": 4, "solana": 2, "unknown": 0 },
      "fundedAt": "…"
    },
    "signature": "hex", "algorithm": "HMAC-SHA256", "canonicalization": "sorted-json"
  }
}
```

---

## POST /verify — free

Body: `{"payload": …, "signature": "hex"}` (any artifact issued by this server) → `{"valid": true|false}`.

## GET /healthz — free

`{"ok":true,"service":"x402-group-pay","rails":[{"rail":"evm","network":"base-sepolia"},{"rail":"solana","network":"solana"}]}`

## Error codes

| Status | Meaning |
|---|---|
| 400 | Invalid body — response includes a retry hint |
| 402 | Payment required, or the payment failed verification/settlement. Body carries the dual-rail `accepts[]` and an `error` reason |
| 404 | Pool not found (paid → signed refund claim included) |
| 409 | Pool funded or expired (paid → signed refund claim included) |
| 500 | `no_payment_rail` — neither rail is configured on this deployment |
| 502 | `facilitator_unreachable` / `settlement_error` — the rail's facilitator failed; nothing was charged |

## Signature scheme

`signature = HMAC-SHA256(SIGNING_SECRET, canonicalJson(payload))` where `canonicalJson` recursively sorts object keys and strips `undefined`. See `src/sign.ts` (`sign`, `verify`, `canonicalize`).
