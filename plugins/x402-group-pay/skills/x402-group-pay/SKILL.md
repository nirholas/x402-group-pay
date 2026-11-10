---
name: x402-group-pay
description: Call the x402-group-pay HTTP service to create a pool for a shared purchase, let each participant pay one share unit, and fetch a signed funded proof for the merchant. Use when several people or agents split one booking.
---

# x402-group-pay

x402-group-pay is an Express service. An organizer creates a pool for a target amount. Each participant pays a fixed USDC share unit over x402 and gets a signed contribution receipt in the same response. When all units are paid, anyone can fetch a signed funded proof listing every contributor. Members of one pool may pay on different rails.

## Run it

No package is published and there is no hosted instance, so run it from a clone: `git clone https://github.com/nirholas/x402-group-pay && cd x402-group-pay`, then `npm install`, `cp .env.example .env`, and `npm run dev` (tsx `src/server.ts`). It listens on `PORT`, default 4041. For production use `npm run build` then `npm start`.

Key env vars: `PORT`, `SHARE_UNIT` (USD per share, default 0.01), `SIGNING_SECRET`, `PUBLIC_BASE_URL`, `PAY_TO_ADDRESS`, `SOLANA_PAY_TO_ADDRESS`, `NETWORK`, `SOLANA_NETWORK`, `SOLANA_RPC_URL`.

## Endpoints

- `POST /pools` ($0.001). Body `{"purpose": "Dinner at Luna, table for 6", "merchant": "Luna Trattoria", "totalUsd": 0.06, "expiresInHours": 24}`. `totalUsd` is rounded up to a whole number of share units. Returns `pool` (`poolId`, `shareUnitUsd`, `unitsRequired`, `unitsPaid`, `status`, `expiresAt`), `joinLinks` (`human`, `agentPay`, `status`, `proof`) and `rails`.
- `POST /pools/:id/pay` ($0.01, one share unit). Call it once per unit. Returns a signed `receipt` recording the rail, network and settlement transaction. A missing pool returns 404 and a funded or expired pool returns 409, each with a signed `refundClaim`.
- `GET /pools/:id` (free): the live pool record.
- `GET /pools/:id/proof` (free): `{status: "pending", unitsPaid, unitsRequired, remainingUsd}` while open; once funded, `{status: "funded", proof: {payload, signature}}` listing every contributor, rail and settlement transaction.
- `POST /verify` (free): body `{payload, signature}` returns `{valid}`.
- `GET /healthz` (free).

Share the `human` link with people and the `agentPay` URL with agents. The proof is a signed record of who paid, so present it to the merchant that requires the pooled amount. Each `pay` call charges the caller one unit, so confirm with the user before paying.

## Paying

Every paid route answers an unpaid request with HTTP 402 and a body whose `accepts` array lists two rails: USDC on Base (`base-sepolia` by default, `base` via `NETWORK`) and USDC on Solana (`solana` by default, `solana-devnet` via `SOLANA_NETWORK`). Pick the entry your wallet can sign, sign the USDC payment (EIP-3009 on Base, SPL `transferChecked` on Solana), and retry with the base64 `X-PAYMENT` header. The artifact is in the 200 body and the settlement receipt is in the `X-PAYMENT-RESPONSE` header. On the EVM rail `x402-fetch` with `viem` does this for you; `npm run client` runs `examples/agent-client.ts`, which reads `BASE_URL` and `PRIVATE_KEY`.

Discovery: `GET /.well-known/x402` lists routes, prices and rails, and `GET /skill.md` serves the repo's own reference. Paying moves real USDC on the configured network, so show the user the route, amount and rail first and wait for a yes before any paid call. Use a throwaway wallet on `base-sepolia` or `solana-devnet` for testing.
