# Exposing x402-group-pay as an MCP tool for Claude

Model Context Protocol (MCP) lets Claude call this service as a tool. The tool
implementation wraps `x402-fetch`, so every call pays its own way with USDC.

The service is **dual rail** — its 402 challenges accept USDC on Base *and* USDC on Solana. `x402-fetch` pays the Base rail; to pay from a Solana wallet instead, swap the fetch wrapper for an x402 Solana client (see [`docs/agents.md`](../docs/agents.md#solana-rail)). Everything below is otherwise identical.

## Minimal MCP server (TypeScript)

```ts
// mcp-group-pay.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.GROUP_PAY_URL ?? "http://localhost:4041";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

const server = new McpServer({ name: "x402-group-pay", version: "0.1.0" });

server.tool(
  "create_pool",
  "Create a group-payment pool that splits a purchase across N wallets ($0.001)",
  { purpose: z.string(), totalUsd: z.number(), merchant: z.string().optional() },
  async (args) => {
    const res = await payFetch(`${BASE_URL}/pools`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: await res.text() }] };
  }
);

server.tool(
  "contribute_share",
  "Pay one share unit into a pool; returns a signed contribution receipt ($0.01)",
  { poolId: z.string() },
  async ({ poolId }) => {
    const res = await payFetch(`${BASE_URL}/pools/${poolId}/pay`, { method: "POST" });
    return { content: [{ type: "text", text: await res.text() }] };
  }
);

server.tool(
  "pool_proof",
  "Fetch pool status / signed funded proof (free)",
  { poolId: z.string() },
  async ({ poolId }) => {
    const res = await fetch(`${BASE_URL}/pools/${poolId}/proof`);
    return { content: [{ type: "text", text: await res.text() }] };
  }
);

await server.connect(new StdioServerTransport());
```

## claude_desktop_config.json

```json
{
  "mcpServers": {
    "x402-group-pay": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-group-pay.ts"],
      "env": {
        "GROUP_PAY_URL": "http://localhost:4041",
        "PRIVATE_KEY": "0x…wallet with Base Sepolia USDC…"
      }
    }
  }
}
```

Give the wallet a small, capped balance — every tool call spends real (testnet) USDC. The tool results include each artifact's `rail` and `settlementTx`, so the agent can report which chain it paid on.
See also `x402-mcp-commerce` in the suite for a ready-made multi-service MCP server.
