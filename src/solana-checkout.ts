// Optional browser-side Solana checkout helper for the human demo page.
//
// IMPORTANT: this is NOT part of the payment verification path. Verifying and
// settling both rails happens in `payments.ts` via `useFacilitator` from
// `x402/verify`, exactly as for the EVM rail. This module exists only because
// Phantom signs serialized transactions but does not build instructions, so a
// browser needs a small endpoint to assemble the SPL `transferChecked` it will
// sign and to wrap the signed result into the base64 `X-PAYMENT` envelope.
//
// Agent clients never touch this. They build the transaction themselves and
// POST straight to the paid route.
//
// It is opt-in: `@three-ws/x402-payment-modal` plus its `@solana/web3.js` and
// `@solana/spl-token` peer dependencies must be installed. When they are not,
// this returns null, the server logs a line, and everything else — including
// the Solana rail for agent clients — keeps working.

import type { Router } from "express";

export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export async function solanaCheckoutRouter(): Promise<Router | null> {
  try {
    // Indirect specifier: the package is an optional dependency, so it must not
    // become a hard compile-time or load-time requirement.
    const specifier = "@three-ws/x402-payment-modal/server/express";
    const mod = (await import(specifier)) as {
      x402CheckoutRouter: (opts: { rpcUrl?: string }) => Router;
    };
    return mod.x402CheckoutRouter({ rpcUrl: SOLANA_RPC_URL });
  } catch {
    return null;
  }
}
