# x402-group-pay

> Split one booking across N wallets — the 6-person dinner problem: pooled x402 contributions with signed receipts and funded proofs.

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![x402](https://img.shields.io/badge/payments-x402%20%2F%20USDC-0052ff)
![rails](https://img.shields.io/badge/rails-Base%20%2B%20Solana-9945ff)
![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)

> **Pay in USDC on Base or Solana — your client picks the rail.** Every 402 challenge lists both, and a pool records which rail funded each contribution.

Six people, one reservation, no shared card. An organizer creates a **pool** for the target amount; each participant — human at a checkout page or agent over HTTP — pays a fixed USDC share via **x402** and gets a **signed contribution receipt** in the same response. When the last share lands, the pool emits a **signed funded proof** listing every contributor, ready to present to the merchant.

## Why x402 for this

Group payments normally mean one person fronting the money and chasing five others, or a platform holding custodial balances behind accounts and API keys. With x402, each share is a standalone per-request USDC payment: no accounts, no stored cards, no settlement risk between friends — and agents can contribute on behalf of their humans with the exact same HTTP call a browser makes. Because the pool is denominated in USD and every contribution settles in USDC, the friend with a Base wallet and the friend with Phantom can fund the *same* pool without either of them bridging anything.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-group-pay && cd x402-group-pay
npm install
cp .env.example .env        # pre-filled with the suite's receive addresses
npm run dev                 # server on http://localhost:4021
```

It boots with no configuration. To receive the funds yourself, set `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana) in `.env` — the server logs a note while the suite defaults are in use.

Then run the full paid flow with an agent wallet holding [Base Sepolia USDC](https://faucet.circle.com):

```bash
PRIVATE_KEY=0x... npm run client
```

Or open **http://localhost:4021** for the human checkout demo (drop-in payment modal).

## API

| Route | Price | What you get back |
|---|---|---|
| `POST /pools` | $0.001 | Pool record + human/agent join links |
| `POST /pools/:id/pay` | $0.01 (one share unit) | Signed contribution receipt with live progress |
| `GET /pools/:id` | free | Live pool record |
| `GET /pools/:id/proof` | free | Pending snapshot → signed funded proof once complete |
| `POST /verify` | free | Signature check for any artifact issued here |
| `GET /healthz` | free | Liveness + the rails this deployment accepts |

Each contributor pays on **whichever rail they hold** — the receipt records `rail` (`evm`/`solana`), the settlement `network`, and the transaction reference, and the pool keeps a running `railBreakdown`. A pool's `totalUsd` is split into fixed `SHARE_UNIT` contributions (default $0.01). Members covering multiple units simply call `/pay` multiple times. Contributions to missing/closed pools still return a **signed refund-claim instrument** in the error body — payment never produces a silent side effect.

## How x402 works — two rails, one flow

1. Client calls a paid route → server responds `402 Payment Required` with an `accepts` array holding **both** payment requirements: USDC on Base (EVM) and USDC on Solana (SVM), same price, same resource.
2. Client picks the rail its wallet supports and authorizes exactly that amount — an EIP-3009 transfer authorization on Base, or a fee-sponsored SPL `transferChecked` on Solana — then retries with the `X-PAYMENT` header.
3. The server reads `network` off the payload, selects the matching requirement, and verifies + settles through that rail's facilitator (x402.org for Base, PayAI for Solana by default).
4. Server responds `200` with the artifact in-body and an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (`rail`, `network`, `transaction`, `payer`).

Solana buyers need no SOL: the facilitator's `feePayer` sponsors the network fee, so a USDC balance is enough. `x402-fetch` does steps 2–3 automatically — see [`examples/agent-client.ts`](examples/agent-client.ts) and [`examples/curl.md`](examples/curl.md).

## Real backend / keys

Fully self-contained — no third-party data APIs. Env vars:

- `PAY_TO_ADDRESS` — Base/EVM wallet receiving USDC. Defaults to the suite address.
- `SOLANA_PAY_TO_ADDRESS` — Solana wallet receiving USDC. Defaults to the suite address.
- `NETWORK` / `FACILITATOR_URL` — EVM rail: `base-sepolia` + x402.org facilitator by default; set `NETWORK=base` plus a mainnet facilitator to go live.
- `SOLANA_NETWORK` / `SOLANA_FACILITATOR_URL` — Solana rail: `mainnet-beta` via PayAI's public facilitator by default; `SOLANA_NETWORK=devnet` for testing.
- A rail whose address is missing or malformed is simply dropped from `accepts` (with a startup warning) — the other rail keeps working.
- `SIGNING_SECRET` — HMAC key for receipts/proofs; a dev fallback (with console warning) keeps the demo keyless.
- `SHARE_UNIT` — contribution unit (default `$0.01`).

State persists to `data/pools.json` (file-based, gitignored).

## Human checkout

`public/index.html` is a working split-the-bill page built on the drop-in [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) (CDN reference — proprietary package, not vendored). Because the 402 challenge advertises both rails, the modal offers EVM wallets *and* Phantom with no extra wiring. It handles wallet connect, SIWX re-entry so returning contributors don't re-approve everything, and per-site spending caps, then emits `x402:result` with the artifact this server returned.

## For AI agents

- **[skill.md](skill.md)** — agent-facing skill file: endpoints, prices, schemas, payment instructions.
- **`GET /.well-known/x402`** — machine-readable manifest indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so agents can discover it.
- **MCP**: [`examples/mcp-tool.md`](examples/mcp-tool.md) shows how to expose pool creation/contribution as Claude tools that pay per call.

## Docs

Full docs on GitHub Pages: **https://nirholas.github.io/x402-group-pay/** — [tutorial](https://nirholas.github.io/x402-group-pay/tutorial), [API reference](https://nirholas.github.io/x402-group-pay/api), [agents guide](https://nirholas.github.io/x402-group-pay/agents).

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

Questions, deployments, or a rail you want added: **nichxbt@gmail.com**

## License

[Apache-2.0](LICENSE)
