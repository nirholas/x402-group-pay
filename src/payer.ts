import type { Request, Response } from "express";
import { paymentReceipt } from "./payments.js";
import type { PaymentFacts } from "./service.js";

/**
 * Everything we know about the payment that funded this request: which wallet
 * paid, which rail it came in on (USDC on Base vs USDC on Solana), and the
 * facilitator's settlement reference.
 *
 * Preference order: the settlement receipt the paywall attached (authoritative,
 * post-settlement) → the raw X-PAYMENT payload (attribution only) → unknown.
 */
export function paymentFacts(req: Request, res: Response): PaymentFacts {
  const receipt = paymentReceipt(res);
  if (receipt) {
    return {
      wallet: typeof receipt.payer === "string" && receipt.payer ? receipt.payer : decodePayer(req),
      rail: (receipt.rail as PaymentFacts["rail"]) ?? "unknown",
      network: typeof receipt.network === "string" ? receipt.network : "unknown",
      settlementTx: typeof receipt.transaction === "string" ? receipt.transaction : null,
    };
  }
  return {
    wallet: decodePayer(req),
    rail: decodeRail(req),
    network: decodeNetwork(req),
    settlementTx: null,
  };
}

function decodeHeader(req: Request): Record<string, any> | null {
  const header = req.header("x-payment");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of the paying wallet address from the X-PAYMENT
 * header (base64-encoded x402 payment payload). Falls back to "unknown"
 * when absent or unparsable — attribution only, never used for settlement.
 */
export function decodePayer(req: Request): string {
  const decoded = decodeHeader(req);
  const from =
    decoded?.payload?.authorization?.from ??
    decoded?.payload?.transaction?.from ??
    decoded?.payload?.from ??
    null;
  return typeof from === "string" && from.length > 0 ? from : "unknown";
}

/** Which rail the X-PAYMENT payload targets. */
export function decodeRail(req: Request): PaymentFacts["rail"] {
  const network = decodeHeader(req)?.network;
  if (typeof network !== "string") return "unknown";
  if (network.startsWith("solana")) return "solana";
  if (network.startsWith("base") || network.startsWith("eip155")) return "evm";
  return "unknown";
}

function decodeNetwork(req: Request): string {
  const network = decodeHeader(req)?.network;
  return typeof network === "string" ? network : "unknown";
}
