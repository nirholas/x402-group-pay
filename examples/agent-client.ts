/**
 * Full x402 flow against x402-group-pay, EVM rail (primary).
 *
 * Every paid route here is DUAL RAIL: the 402 challenge lists USDC on Base and
 * USDC on Solana at the same price, and you pay with whichever you hold. This
 * example uses `x402-fetch` + `viem`, which handles the Base rail. See the
 * "Solana rail" note at the bottom of this file for the Phantom/SVM path.
 *
 * Steps:
 *   1. create a pool (paid, $0.001)
 *   2. contribute share units until funded (paid, $0.01 each)
 *   3. fetch the signed funded proof (free)
 *
 * Usage:
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4021 npm run client
 *
 * PRIVATE_KEY must hold Base Sepolia USDC (faucet: https://faucet.circle.com).
 */
import { config } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

config();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4021";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY (0x… key of a wallet holding Base Sepolia USDC).");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

function printReceiptHeader(res: Response, label: string): void {
  const header = res.headers.get("x-payment-response");
  if (header) {
    console.log(`  ${label} X-PAYMENT-RESPONSE:`, JSON.stringify(decodeXPaymentResponse(header)));
  }
}

async function main(): Promise<void> {
  console.log(`agent wallet: ${account.address}`);

  // 1. Create a pool for a $0.03 shared purchase (3 x $0.01 shares).
  const createRes = await payFetch(`${BASE_URL}/pools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      purpose: "Dinner at Luna — table for 3 (demo)",
      merchant: "Luna Trattoria",
      totalUsd: 0.03,
      expiresInHours: 2,
    }),
  });
  const created = await createRes.json();
  console.log("\n1) pool created:", JSON.stringify(created.pool, null, 2));
  printReceiptHeader(createRes, "create");

  const poolId: string = created.pool.poolId;
  const units: number = created.pool.unitsRequired;

  // 2. Contribute until funded (here one wallet plays all 3 members).
  for (let i = 0; i < units; i++) {
    const payRes = await payFetch(`${BASE_URL}/pools/${poolId}/pay`, { method: "POST" });
    const body = await payRes.json();
    console.log(`\n2.${i + 1}) contribution receipt:`, JSON.stringify(body.receipt?.payload ?? body, null, 2));
    printReceiptHeader(payRes, `pay#${i + 1}`);
  }

  // Note the receipt's `rail`, `network` and `settlementTx`: the pool records
  // which rail funded each unit, so a Base contributor and a Solana
  // contributor can fund the same pool.

  // 3. Funded proof (free).
  const proofRes = await fetch(`${BASE_URL}/pools/${poolId}/proof`);
  const proof = await proofRes.json();
  console.log("\n3) funded proof:", JSON.stringify(proof, null, 2));

  // 4. Verify the proof signature server-side (free).
  if (proof.proof) {
    const verifyRes = await fetch(`${BASE_URL}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof.proof),
    });
    console.log("\n4) signature valid:", (await verifyRes.json()).valid);
  }
}

main().catch((err) => {
  console.error("agent-client failed:", err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Solana rail — the same routes, paid with USDC on Solana.
 *
 * The 402 body's `accepts` array has a second entry with `network: "solana"`,
 * a base58 `payTo`, the USDC mint as `asset`, and `extra.feePayer` — the
 * facilitator account that sponsors the SOL network fee, so your wallet needs
 * only USDC. Build a fee-sponsored SPL `transferChecked` for
 * `maxAmountRequired`, sign it, and send it base64-encoded as `X-PAYMENT`:
 *
 *   const challenge = await (await fetch(`${BASE_URL}/pools`, { method: "POST" })).json();
 *   const solana = challenge.accepts.find((a: any) => a.network.startsWith("solana"));
 *
 *   // In a browser, @three-ws/x402-payment-modal does this end to end with
 *   // Phantom (see public/index.html). Headless, use its server helpers:
 *   //   import { prepareSolanaCheckout, encodeX402Payment }
 *   //     from "@three-ws/x402-payment-modal/server";
 *   //   const { tx_base64 } = await prepareSolanaCheckout({ accept: solana, buyer: myPubkey });
 *   //   const signed = await wallet.signTransaction(tx_base64);
 *   //   const { x_payment } = encodeX402Payment({
 *   //     accept: solana, signedTxBase64: signed, resourceUrl: solana.resource,
 *   //   });
 *   //   await fetch(`${BASE_URL}/pools`, { method: "POST", headers: { "X-PAYMENT": x_payment } });
 *
 * And the raw dual-rail 402 body, for reference:
 *
 *   curl -s -X POST http://localhost:4021/pools \
 *     -H 'content-type: application/json' \
 *     -d '{"purpose":"Dinner for 6","totalUsd":0.06}' | jq '.accepts[] | {network, payTo, maxAmountRequired}'
 *
 *   { "network": "base-sepolia", "payTo": "0x4025…2402", "maxAmountRequired": "1000" }
 *   { "network": "solana",       "payTo": "Wwwu…T3WwW", "maxAmountRequired": "1000" }
 * ------------------------------------------------------------------------- */
