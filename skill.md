# x402-group-pay — agent skill

Split one booking (or any shared purchase) across N wallets. An organizer creates a pool for a target amount; each participant — human or agent — pays a fixed USDC share unit via x402 and receives a signed contribution receipt in the same response. Once all units are paid, anyone can fetch a signed **funded proof** listing every contributor, suitable for presenting to the merchant that requires the pooled amount. This solves the 6-person-dinner problem for agentic commerce: no shared cards, no IOUs, cryptographic receipts for everyone.

**Pay in USDC on Base or Solana — your client picks the rail.** Every 402 challenge lists both, and the pool records which rail funded each contribution.

**Base URL**: `{BASE_URL}` (self-hosted; default `http://localhost:4021`)

## Endpoints

### POST /pools — $0.001
Create a pool.

Request body:
```json
{ "purpose": "Dinner at Luna — table for 6", "merchant": "Luna Trattoria", "totalUsd": 0.06, "expiresInHours": 24 }
```

Response 200:
```json
{
  "pool": {
    "poolId": "pool_ab12cd34ef56aa00",
    "purpose": "Dinner at Luna — table for 6",
    "merchant": "Luna Trattoria",
    "asset": "USDC",
    "network": "base-sepolia | solana",
    "totalUsd": 0.06,
    "shareUnitUsd": 0.01,
    "unitsRequired": 6,
    "unitsPaid": 0,
    "status": "open",
    "contributions": [],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "expiresAt": "2026-01-02T00:00:00.000Z",
    "fundedAt": null
  },
  "joinLinks": {
    "human": "{BASE_URL}/?pool=pool_ab12cd34ef56aa00",
    "agentPay": "{BASE_URL}/pools/pool_ab12cd34ef56aa00/pay",
    "status": "{BASE_URL}/pools/pool_ab12cd34ef56aa00",
    "proof": "{BASE_URL}/pools/pool_ab12cd34ef56aa00/proof"
  },
  "rails": [
    { "rail": "evm", "network": "base-sepolia", "asset": "USDC", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402" },
    { "rail": "solana", "network": "solana", "asset": "USDC", "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW" }
  ]
}
```

Notes: `totalUsd` is rounded up to a whole number of share units (`SHARE_UNIT`, default $0.01). Share links: send `human` to people (drop-in checkout page), `agentPay` to agents.

### POST /pools/{id}/pay — $0.01 (one share unit)
Contribute exactly one share unit. Call it k times to cover k units. Pay on **either rail** — the receipt records which one settled it, and members of the same pool may use different rails.

Response 200:
```json
{
  "receipt": {
    "payload": {
      "type": "x402-group-pay/contribution-receipt",
      "receiptId": "rcpt_1a2b3c4d5e6f7a8b",
      "poolId": "pool_ab12cd34ef56aa00",
      "wallet": "0xabc…",
      "rail": "evm",
      "network": "base-sepolia",
      "settlementTx": "0x9f…",
      "unitUsd": 0.01,
      "unitsPaid": 3,
      "unitsRequired": 6,
      "railBreakdown": { "evm": 2, "solana": 1, "unknown": 0 },
      "remainingUsd": 0.03,
      "poolStatus": "open",
      "paidAt": "2026-01-01T01:00:00.000Z"
    },
    "signature": "hex-hmac-sha256",
    "algorithm": "HMAC-SHA256",
    "canonicalization": "sorted-json"
  }
}
```

Error bodies still contain a signed artifact: `404 {error:"pool_not_found", refundClaim:{…signed…}}` and `409 {error:"pool_not_open", refundClaim:{…signed…}}` — a signed refund-claim instrument you can present to the pool operator.

### GET /pools/{id} — free
Live pool record.

### GET /pools/{id}/proof — free
`{"status":"pending", unitsPaid, unitsRequired, remainingUsd, expiresAt}` while open; once funded:
```json
{ "status": "funded", "proof": { "payload": { "type": "x402-group-pay/funded-proof", "poolId": "…", "totalUsd": 0.06, "contributors": [{"wallet": "0x…", "unitUsd": 0.01, "rail": "evm", "network": "base-sepolia", "settlementTx": "0x…", "receiptId": "…"}], "railBreakdown": {"evm": 4, "solana": 2, "unknown": 0}, "fundedAt": "…" }, "signature": "…", "algorithm": "HMAC-SHA256" } }
```

### POST /verify — free
Body `{payload, signature}` → `{valid: true|false}`. Verifies any artifact issued by this server.

## Payment — dual rail
Protocol: **x402** (HTTP 402). Asset: **USDC** on both rails. A 402 response carries an `accepts` array with two entries; send `X-PAYMENT` for whichever you can pay.

| Rail | `network` | Asset address | payTo | Facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` (`base` via `NETWORK`) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` (`solana-devnet` via `SOLANA_NETWORK`) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

Flow: make the request → receive `402` with `accepts[]` → pick your rail → sign the USDC authorization (EIP-3009 on Base, fee-sponsored SPL `transferChecked` on Solana; `extra.feePayer` sponsors the SOL fee so you need no SOL) → retry with `X-PAYMENT` → receive `200` with the artifact in-body plus an `X-PAYMENT-RESPONSE` header (`{success, rail, network, transaction, payer, amount, asset}`).

Clients: `x402-fetch` + `viem` for the EVM rail; any x402 Solana client (or `@three-ws/x402-payment-modal` in a browser) for the Solana rail. Sending a payload whose `network` is on neither rail returns `402` again listing what is accepted.

## Error codes
| Status | Meaning |
|---|---|
| 400 | Invalid body (pool creation) — response includes a retry hint |
| 402 | Payment required — body carries x402 `PaymentRequirements` |
| 404 | Pool not found (paid contribution → signed refund claim included) |
| 409 | Pool funded/expired (paid contribution → signed refund claim included) |
| 500 | `no_payment_rail` — neither rail is configured on this deployment |
| 502 | `facilitator_unreachable` / `settlement_error` — the rail's facilitator failed; nothing was charged |

Machine-readable manifest (lists both rails per resource): `{BASE_URL}/.well-known/x402`

Contact: **nichxbt@gmail.com**
