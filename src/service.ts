import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sign, type SignedArtifact } from "./sign.js";

/** One settled share unit. `rail` records which payment network funded it. */
export interface Contribution {
  receiptId: string;
  wallet: string;
  unitUsd: number;
  /** "evm" (USDC on Base) or "solana" (USDC on Solana) — contributors may mix. */
  rail: "evm" | "solana" | "unknown";
  /** x402 network id the settlement landed on, e.g. "base-sepolia" or "solana". */
  network: string;
  /** Settlement tx hash / signature from the facilitator, when available. */
  settlementTx: string | null;
  paidAt: string;
}

/** How many units each rail funded — the pool's rail mix. */
export interface RailBreakdown {
  evm: number;
  solana: number;
  unknown: number;
}

export interface Pool {
  poolId: string;
  purpose: string;
  merchant: string;
  asset: "USDC";
  network: string;
  totalUsd: number;
  shareUnitUsd: number;
  unitsRequired: number;
  unitsPaid: number;
  status: "open" | "funded" | "expired";
  contributions: Contribution[];
  railBreakdown: RailBreakdown;
  createdAt: string;
  expiresAt: string;
  fundedAt: string | null;
}

export interface CreatePoolInput {
  purpose: string;
  merchant?: string;
  totalUsd: number;
  expiresInHours?: number;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "pools.json");

/** What the paywall learned about the settled payment for this contribution. */
export interface PaymentFacts {
  wallet: string;
  rail: "evm" | "solana" | "unknown";
  network: string;
  settlementTx: string | null;
}

export function shareUnitUsd(): number {
  const raw = (process.env.SHARE_UNIT ?? "$0.01").replace(/^\$/, "");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.01;
}

export class PoolStore {
  private pools = new Map<string, Pool>();

  constructor(private readonly network: string) {
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Pool[];
        for (const pool of raw) this.pools.set(pool.poolId, pool);
      }
    } catch {
      // Corrupt or missing state file — start fresh.
    }
  }

  private save(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify([...this.pools.values()], null, 2));
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative.
    }
  }

  createPool(input: CreatePoolInput): { error?: string; pool?: Pool } {
    const totalUsd = Number(input.totalUsd);
    if (!input.purpose || typeof input.purpose !== "string") {
      return { error: "purpose (string) is required" };
    }
    if (!Number.isFinite(totalUsd) || totalUsd <= 0 || totalUsd > 1000) {
      return { error: "totalUsd must be a number between 0.01 and 1000" };
    }
    const unit = shareUnitUsd();
    const unitsRequired = Math.max(1, Math.ceil(Math.round(totalUsd * 1000) / Math.round(unit * 1000)));
    const now = new Date();
    const hours = Math.min(Math.max(input.expiresInHours ?? 72, 1), 24 * 30);
    const pool: Pool = {
      poolId: `pool_${randomBytes(8).toString("hex")}`,
      purpose: input.purpose.slice(0, 300),
      merchant: (input.merchant ?? "unspecified").slice(0, 200),
      asset: "USDC",
      network: this.network,
      totalUsd: Math.round(unitsRequired * unit * 1000) / 1000,
      shareUnitUsd: unit,
      unitsRequired,
      unitsPaid: 0,
      status: "open",
      contributions: [],
      railBreakdown: { evm: 0, solana: 0, unknown: 0 },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
      fundedAt: null,
    };
    this.pools.set(pool.poolId, pool);
    this.save();
    return { pool };
  }

  getPool(poolId: string): Pool | undefined {
    const pool = this.pools.get(poolId);
    if (pool && pool.status === "open" && new Date(pool.expiresAt).getTime() < Date.now()) {
      pool.status = "expired";
      this.save();
    }
    return pool;
  }

  /** Record one paid share unit. Always returns a signed artifact — the payment already settled. */
  contribute(poolId: string, payment: PaymentFacts): {
    kind: "receipt" | "overfunded" | "misdirected";
    artifact: SignedArtifact<Record<string, unknown>>;
  } {
    const { wallet, rail, network, settlementTx } = payment;
    const pool = this.getPool(poolId);
    const paidAt = new Date().toISOString();
    const receiptId = `rcpt_${randomBytes(8).toString("hex")}`;
    const unit = pool?.shareUnitUsd ?? shareUnitUsd();

    if (!pool) {
      // Payment settled against a nonexistent pool: return a signed refund-claim instrument.
      return {
        kind: "misdirected",
        artifact: sign({
          type: "x402-group-pay/refund-claim",
          receiptId,
          poolId,
          wallet,
          rail,
          network,
          settlementTx,
          unitUsd: unit,
          paidAt,
          reason: "pool_not_found",
          instructions:
            "Present this signed claim to the pool operator (PAY_TO_ADDRESS recipient) for an off-band refund of one share unit.",
        }),
      };
    }

    if (pool.status !== "open") {
      return {
        kind: "overfunded",
        artifact: sign({
          type: "x402-group-pay/refund-claim",
          receiptId,
          poolId,
          wallet,
          rail,
          network,
          settlementTx,
          unitUsd: unit,
          paidAt,
          reason: pool.status === "funded" ? "pool_already_funded" : "pool_expired",
          instructions:
            "Pool no longer accepts contributions. Present this signed claim to the pool operator for an off-band refund of one share unit.",
        }),
      };
    }

    pool.unitsPaid += 1;
    pool.contributions.push({ receiptId, wallet, unitUsd: unit, rail, network, settlementTx, paidAt });
    pool.railBreakdown = pool.railBreakdown ?? { evm: 0, solana: 0, unknown: 0 };
    pool.railBreakdown[rail] += 1;
    if (pool.unitsPaid >= pool.unitsRequired) {
      pool.status = "funded";
      pool.fundedAt = paidAt;
    }
    this.save();

    return {
      kind: "receipt",
      artifact: sign({
        type: "x402-group-pay/contribution-receipt",
        receiptId,
        poolId,
        wallet,
        rail,
        network,
        settlementTx,
        unitUsd: unit,
        unitsPaid: pool.unitsPaid,
        railBreakdown: { ...pool.railBreakdown },
        unitsRequired: pool.unitsRequired,
        remainingUsd: Math.max(0, Math.round((pool.unitsRequired - pool.unitsPaid) * unit * 1000) / 1000),
        poolStatus: pool.status,
        paidAt,
      }),
    };
  }

  /** Signed funded proof once the pool is complete; a pending snapshot otherwise. */
  proof(poolId: string):
    | { funded: true; artifact: SignedArtifact<Record<string, unknown>> }
    | { funded: false; snapshot: Record<string, unknown> }
    | undefined {
    const pool = this.getPool(poolId);
    if (!pool) return undefined;
    if (pool.status !== "funded") {
      return {
        funded: false,
        snapshot: {
          poolId: pool.poolId,
          status: pool.status,
          unitsPaid: pool.unitsPaid,
          unitsRequired: pool.unitsRequired,
          railBreakdown: { ...(pool.railBreakdown ?? { evm: 0, solana: 0, unknown: 0 }) },
          remainingUsd:
            Math.max(0, Math.round((pool.unitsRequired - pool.unitsPaid) * pool.shareUnitUsd * 1000) / 1000),
          expiresAt: pool.expiresAt,
        },
      };
    }
    return {
      funded: true,
      artifact: sign({
        type: "x402-group-pay/funded-proof",
        poolId: pool.poolId,
        purpose: pool.purpose,
        merchant: pool.merchant,
        asset: pool.asset,
        network: pool.network,
        totalUsd: pool.totalUsd,
        contributors: pool.contributions.map((c) => ({
          wallet: c.wallet,
          unitUsd: c.unitUsd,
          rail: c.rail,
          network: c.network,
          settlementTx: c.settlementTx,
          receiptId: c.receiptId,
        })),
        railBreakdown: { ...pool.railBreakdown },
        fundedAt: pool.fundedAt,
      }),
    };
  }
}
