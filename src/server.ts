import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeRails, paywall, usingSuiteDefaultPayTo } from "./payments.js";
import { PoolStore, shareUnitUsd } from "./service.js";
import { paymentFacts } from "./payer.js";
import { usingDevSecret, verify } from "./sign.js";
import { solanaCheckoutRouter } from "./solana-checkout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const PORT = Number(process.env.PORT ?? 4041);
const SHARE_UNIT = `$${shareUnitUsd()}`;

const PRICES: Record<string, string> = {
  "POST /pools": "$0.001",
  "POST /pools/:id/pay": SHARE_UNIT,
};

const DESCRIPTIONS: Record<string, string> = {
  "POST /pools": "Create a group-payment pool; returns the pool record + join links",
  "POST /pools/:id/pay": `Contribute one share unit (${SHARE_UNIT}); returns a signed contribution receipt`,
};

const rails = activeRails();
const store = new PoolStore(rails.map((r) => r.network).join(" | ") || "unconfigured");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(paywall(PRICES, { service: "x402-group-pay", descriptions: DESCRIPTIONS }));

function baseUrl(req: express.Request): string {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ---------- paid routes ----------

app.post("/pools", (req, res) => {
  const { error, pool } = store.createPool(req.body ?? {});
  if (error || !pool) {
    // Payment settled; return the error plus a usable retry hint in-body.
    res.status(400).json({ error, hint: "POST body: {purpose, totalUsd, merchant?, expiresInHours?}" });
    return;
  }
  const base = baseUrl(req);
  res.status(200).json({
    pool,
    joinLinks: {
      human: `${base}/?pool=${pool.poolId}`,
      agentPay: `${base}/pools/${pool.poolId}/pay`,
      status: `${base}/pools/${pool.poolId}`,
      proof: `${base}/pools/${pool.poolId}/proof`,
    },
    rails: rails.map((r) => ({ rail: r.rail, network: r.network, asset: "USDC", payTo: r.payTo })),
    note:
      `Each contribution pays exactly one share unit of ${SHARE_UNIT}. ` +
      `${pool.unitsRequired} units fund this pool. Contributors may pay on EITHER rail — ` +
      `USDC on Base or USDC on Solana — and the pool records which rail funded each unit.`,
  });
});

app.post("/pools/:id/pay", (req, res) => {
  const facts = paymentFacts(req, res);
  const result = store.contribute(req.params.id, facts);
  if (result.kind === "misdirected") {
    res.status(404).json({
      error: "pool_not_found",
      refundClaim: result.artifact,
    });
    return;
  }
  if (result.kind === "overfunded") {
    res.status(409).json({
      error: "pool_not_open",
      refundClaim: result.artifact,
    });
    return;
  }
  res.status(200).json({ receipt: result.artifact });
});

// ---------- free routes ----------

app.get("/pools/:id", (req, res) => {
  const pool = store.getPool(req.params.id);
  if (!pool) {
    res.status(404).json({ error: "pool_not_found" });
    return;
  }
  res.json({ pool });
});

app.get("/pools/:id/proof", (req, res) => {
  const proof = store.proof(req.params.id);
  if (!proof) {
    res.status(404).json({ error: "pool_not_found" });
    return;
  }
  if (!proof.funded) {
    res.json({ status: "pending", ...proof.snapshot });
    return;
  }
  res.json({ status: "funded", proof: proof.artifact });
});

app.post("/verify", (req, res) => {
  const { payload, signature } = req.body ?? {};
  if (payload === undefined || typeof signature !== "string") {
    res.status(400).json({ error: "body must be {payload, signature}" });
    return;
  }
  res.json({ valid: verify({ payload, signature }) });
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-group-pay",
    rails: rails.map((r) => ({ rail: r.rail, network: r.network })),
  });
});

app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json");
  res.sendFile(path.join(PUBLIC_DIR, ".well-known", "x402"));
});

// Agent-facing skill file lives at the repo root; serve it alongside the manifest.
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown");
  res.sendFile(path.resolve(__dirname, "..", "skill.md"));
});

app.use(express.static(PUBLIC_DIR));

// Optional: the browser-side Solana checkout helper the payment modal uses for
// Phantom. Not part of verification — both rails verify + settle through their
// facilitator in payments.ts. Absent deps just mean the human demo page falls
// back to EVM wallets; agent clients are unaffected either way.
const checkoutRouter = await solanaCheckoutRouter();
if (checkoutRouter) {
  app.use("/api/x402-checkout", checkoutRouter);
}

app.listen(PORT, () => {
  console.log(`x402-group-pay listening on http://localhost:${PORT}`);
  console.log("  Payment rails (client picks one):");
  for (const rail of rails) {
    console.log(`    ${rail.rail.padEnd(7)} ${rail.network.padEnd(14)} USDC → ${rail.payTo}`);
    console.log(`            facilitator: ${rail.facilitator}`);
  }
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  NOTE: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself.",
    );
  }
  console.log(
    checkoutRouter
      ? "  Solana browser checkout: mounted at /api/x402-checkout (Phantom enabled on the demo page)"
      : "  Solana browser checkout: not mounted — install @three-ws/x402-payment-modal, @solana/web3.js\n" +
        "                           and @solana/spl-token to enable Phantom on the demo page.\n" +
        "                           The Solana rail itself still works for agent clients.",
  );
  if (usingDevSecret()) {
    console.log("  WARNING: using built-in dev SIGNING_SECRET — set SIGNING_SECRET in production.");
  }
  console.log("  Paid routes:");
  for (const [route, price] of Object.entries(PRICES)) {
    console.log(`    ${route.padEnd(26)} ${price}`);
  }
  console.log(
    "  Free routes: GET /pools/:id, GET /pools/:id/proof, POST /verify, GET /healthz, GET /.well-known/x402",
  );
});
