# Tutorial — from clone to funded pool

This walkthrough takes you from `git clone` to a fully funded pool with a signed proof.

Every paid route here accepts **USDC on Base or USDC on Solana** — the 402 challenge lists both and the client picks. The walkthrough uses the Base Sepolia testnet rail because it is the easiest to fund; step 7 covers the Solana rail and mainnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-group-pay
cd x402-group-pay
npm install
```

Requires Node 18+.

## 2. Configure

```bash
cp .env.example .env
```

`.env.example` ships pre-filled with the x402 Suite's public receive addresses, so **the server runs with no edits**. To receive the money yourself, replace both:

```
# EVM (Base / Base Sepolia) USDC receive address
PAY_TO_ADDRESS=0xYourReceivingWallet
# Solana USDC receive address
SOLANA_PAY_TO_ADDRESS=YourBase58SolanaWallet
```

The server logs a note at startup while the suite defaults are still in use. Optional: `SIGNING_SECRET` (receipt HMAC key — a dev default is used otherwise), `SHARE_UNIT` (default `$0.01`), `PORT` (default `4021`), `NETWORK` / `SOLANA_NETWORK` to switch each rail's network.

## 3. Run the server

```bash
npm run dev
```

The startup banner lists both payment rails (network, receive address, facilitator) and the paid routes with prices:

```
  Payment rails (client picks one):
    evm     base-sepolia   USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
            facilitator: https://x402.org/facilitator
    solana  solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
            facilitator: https://facilitator.payai.network
```

Open http://localhost:4041 for the human checkout demo — the modal offers both EVM wallets and Phantom.

## 4. Your first 402

```bash
curl -si -X POST http://localhost:4041/pools \
  -H 'content-type: application/json' \
  -d '{"purpose":"Dinner for 6","totalUsd":0.06}'
```

You get `HTTP/1.1 402 Payment Required` and a JSON body whose `accepts[]` array holds **two** x402 `PaymentRequirements` — one per rail, same price:

```bash
curl -s -X POST http://localhost:4041/pools \
  -H 'content-type: application/json' -d '{"purpose":"Dinner for 6","totalUsd":0.06}' \
  | jq '.accepts[] | {network, payTo, asset, maxAmountRequired}'
```

```json
{ "network": "base-sepolia", "payTo": "0x4025…2402", "asset": "0x036C…CF7e", "maxAmountRequired": "1000" }
{ "network": "solana",       "payTo": "Wwwu…T3WwW", "asset": "EPjF…TDt1v", "maxAmountRequired": "1000" }
```

`maxAmountRequired` is USDC base units (6 decimals), so `"1000"` = $0.001. Nothing was charged; this is the price quote. Pay whichever entry matches the wallet you have.

## 5. A paid call

Fund a second wallet with Base Sepolia USDC from https://faucet.circle.com, then:

```bash
PRIVATE_KEY=0xThatWalletsKey npm run client
```

`examples/agent-client.ts` wraps `fetch` with `x402-fetch`, which intercepts the 402, picks the EVM entry from `accepts[]`, signs an EIP-3009 USDC transfer authorization for the exact amount, retries with the `X-PAYMENT` header, and hands you the 200. The script:

1. creates a $0.03 pool (3 share units),
2. pays all 3 shares (printing each signed contribution receipt and the `X-PAYMENT-RESPONSE` settlement receipt),
3. fetches the signed funded proof,
4. verifies the proof signature via `POST /verify`.

## 6. Reading the artifact

Every paid response carries its artifact in the body:

- **Pool creation** → the pool record + join links. Send `joinLinks.human` to people, `joinLinks.agentPay` to agents.
- **Contribution** → `receipt.payload` (who paid, which unit, progress) + `receipt.signature`, an HMAC-SHA256 over the canonical (sorted-key) JSON of the payload. Anyone can re-verify via `POST /verify` or the exported `verify()` in `src/sign.ts`.
- **Funded proof** → the contributor list with per-wallet receipts, signed the same way.

Each receipt records the rail it settled on:

```json
{ "wallet": "0xabc…", "rail": "evm", "network": "base-sepolia", "settlementTx": "0x9f…",
  "unitsPaid": 3, "railBreakdown": { "evm": 2, "solana": 1, "unknown": 0 } }
```

So a friend paying from a Base wallet and a friend paying from Phantom fund the same pool, and the funded proof shows exactly who paid on which chain. The `X-PAYMENT-RESPONSE` header carries the same facts for the request you just made:

```bash
echo "<X-PAYMENT-RESPONSE value>" | base64 -d | jq
# { "success": true, "rail": "solana", "network": "solana", "transaction": "5xY…", "payer": "7hF…" }
```

## 7. Paying on the Solana rail

The second `accepts[]` entry is the Solana rail. Its `extra.feePayer` is the facilitator account that sponsors the SOL network fee, so a payer needs **only USDC** — no SOL for gas.

- **In a browser**: nothing to do. `public/index.html` uses `@three-ws/x402-payment-modal`, which reads both entries and offers Phantom alongside EVM wallets.
- **Headless**: build a fee-sponsored SPL `transferChecked` for `maxAmountRequired` to the base58 `payTo`, sign it with your wallet, and send the base64 x402 envelope as `X-PAYMENT`. The modal's server helpers do the building and encoding:

```ts
import { prepareSolanaCheckout, encodeX402Payment } from "@three-ws/x402-payment-modal/server";

const challenge = await (await fetch(`${BASE}/pools`, { method: "POST" })).json();
const accept = challenge.accepts.find((a) => a.network.startsWith("solana"));

const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: myPublicKey });
const signedTxBase64 = await wallet.signTransaction(tx_base64);
const { x_payment } = encodeX402Payment({ accept, signedTxBase64, resourceUrl: accept.resource });

const paid = await fetch(`${BASE}/pools`, { method: "POST", headers: { "X-PAYMENT": x_payment } });
```

To test on devnet instead of mainnet, set `SOLANA_NETWORK=devnet`.

## 8. Going to mainnet

1. **EVM rail**: set `NETWORK=base` and point `FACILITATOR_URL` at a mainnet-capable facilitator (e.g. Coinbase CDP's — the default x402.org facilitator settles testnets).
2. **Solana rail**: already mainnet by default (`SOLANA_NETWORK=mainnet-beta`, PayAI facilitator). Nothing to change.
3. Set a strong `SIGNING_SECRET`.
4. Use real receiving wallets for `PAY_TO_ADDRESS` and `SOLANA_PAY_TO_ADDRESS` — contributions are now real USDC.

Want a single rail? Unset the other rail's `payTo`; it is dropped from `accepts` with a startup warning and the remaining rail keeps working.

Prices stay in dollar strings (`$0.01`); the middleware converts to USDC base units per network, so both rails always quote the same price.
