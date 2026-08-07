# For AI agents

x402-group-pay is built to be consumed by autonomous agents end-to-end: discovery, payment, and verification all happen over plain HTTP with no accounts.

**Pay in USDC on Base or Solana — your client picks the rail.** Every 402 challenge carries both requirements at the same price; send `X-PAYMENT` for whichever wallet you hold.

## Discovery

Two machine-readable entry points, served by every deployment:

1. **`/skill.md`** (also at the repo root) — a human-and-agent-readable skill file describing every endpoint, price, parameter, and response schema, following the agentres.dev skill.md pattern. Feed it to your agent as context and it knows how to use the service.
2. **`GET /.well-known/x402`** — a JSON manifest (`x402Version`, `payment.rails[]`, and `resources[]` with prices, both networks, per-rail `accepts`, and output schemas) in the discovery format indexed by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market).

**Operators:** after deploying, submit your base URL to those indexes so agents can find your pools — x402scan crawls `/.well-known/x402` automatically once listed.

## Paying

Any x402-compatible client works. With `x402-fetch`:

```ts
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY));
const res = await payFetch("https://pool-host.example/pools/pool_abc/pay", { method: "POST" });
const { receipt } = await res.json();     // signed contribution receipt — keep it
```

The wrapper handles the 402 → sign → retry loop and enforces a max payment cap (default 0.10 USDC) so a misconfigured server can't drain the wallet. It selects the EVM entry from `accepts[]`.

### Solana rail

Read the entry whose `network` starts with `solana`, build a fee-sponsored SPL `transferChecked` for `maxAmountRequired` to the base58 `payTo`, sign it, and send the base64 x402 envelope as `X-PAYMENT`. `extra.feePayer` sponsors the SOL network fee, so a USDC balance is sufficient — no SOL required.

```ts
import { prepareSolanaCheckout, encodeX402Payment } from "@three-ws/x402-payment-modal/server";

const res = await fetch(url, { method: "POST" });          // → 402
const accept = (await res.json()).accepts.find((a) => a.network.startsWith("solana"));
const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: myPublicKey });
const { x_payment } = encodeX402Payment({
  accept, signedTxBase64: await wallet.signTransaction(tx_base64), resourceUrl: accept.resource,
});
const paid = await fetch(url, { method: "POST", headers: { "X-PAYMENT": x_payment } });
```

### Reading the settlement receipt

Every paid `200` carries `X-PAYMENT-RESPONSE`, base64 JSON: `{success, rail, network, transaction, payer, amount, asset}`. Use `rail` to record which chain your budget was drawn on.

## What you get back

- **Contribution receipt** (paid): proof your wallet funded one share, including the `rail`, settlement `network` and `settlementTx` — store `receipt.payload` + `receipt.signature`; anyone can re-verify via `POST /verify`.
- **Funded proof** (free): the complete contributor list with each contributor's rail and settlement reference, plus a `railBreakdown` summary, signed. This is the instrument the organizer presents to the merchant (or to a booking service like `x402-tablebook`) as evidence the group's money is in.
- **Refund claim** (on 404/409 after payment): a signed instrument for off-band refunds — payment never disappears into a side effect.

## MCP integration

To give Claude these capabilities as tools, see [`examples/mcp-tool.md`](https://github.com/nirholas/x402-group-pay/blob/main/examples/mcp-tool.md) — a minimal MCP server exposing `create_pool`, `contribute_share`, and `pool_proof`, each paying its own way via `x402-fetch`. The suite's `x402-mcp-commerce` repo bundles this pattern for many services at once.

## Composing with the suite

Typical agent flow: `x402-group-pay` collects the money → the funded proof rides along in a booking request to `x402-tablebook` (restaurant) or `x402-bookable` (appointments) → `x402-confirmations` normalizes the resulting confirmation. Budget guardrails: wrap your fetch with `x402-agent-wallet`'s policy checks.

Questions or integration help: **nichxbt@gmail.com**
