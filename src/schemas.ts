// GENERATED from openapi.json — do not edit by hand.
//
// Per-route invocation contracts published inside the x402 402 challenge as
// `accepts[].outputSchema`. `input` tells an agent how to build the request
// (method, query/path params, JSON body fields); `output` is the JSON Schema of
// the 200 body it gets back once payment settles.
//
// Deriving these from `openapi.json` keeps the runtime challenge — which the
// x402scan discovery spec treats as authoritative — from ever contradicting the
// published spec. Regenerate whenever a paid route's parameters or response
// schema change.
//
// Keys match the paywall route map in `server.ts` exactly (`"<METHOD> <path>"`,
// with `:param` for path segments).

import type { RouteSchema } from "./payments.js";

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "POST /pools": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "purpose": {
          "type": "string",
          "x-required": true
        },
        "merchant": {
          "type": "string"
        },
        "totalUsd": {
          "type": "number",
          "x-required": true
        },
        "expiresInHours": {
          "type": "number"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "pool": {
          "type": "object",
          "properties": {
            "poolId": {
              "type": "string"
            },
            "purpose": {
              "type": "string"
            },
            "merchant": {
              "type": "string"
            },
            "asset": {
              "type": "string"
            },
            "network": {
              "type": "string",
              "description": "Rails this pool accepts, e.g. \"base-sepolia | solana\"."
            },
            "totalUsd": {
              "type": "number"
            },
            "shareUnitUsd": {
              "type": "number"
            },
            "unitsRequired": {
              "type": "integer"
            },
            "unitsPaid": {
              "type": "integer"
            },
            "status": {
              "type": "string",
              "enum": [
                "open",
                "funded",
                "expired"
              ]
            },
            "contributions": {
              "type": "array",
              "items": {
                "type": "object",
                "description": "One settled share unit. `rail` records which network funded it \u2014 members of one pool may mix rails.",
                "properties": {
                  "receiptId": {
                    "type": "string"
                  },
                  "wallet": {
                    "type": "string"
                  },
                  "unitUsd": {
                    "type": "number"
                  },
                  "rail": {
                    "type": "string",
                    "enum": [
                      "evm",
                      "solana",
                      "unknown"
                    ]
                  },
                  "network": {
                    "type": "string"
                  },
                  "settlementTx": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "paidAt": {
                    "type": "string"
                  },
                  "facilitator": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "Facilitator that settled this contribution. The two rails differ."
                  }
                }
              }
            },
            "createdAt": {
              "type": "string"
            },
            "expiresAt": {
              "type": "string"
            },
            "fundedAt": {
              "type": [
                "string",
                "null"
              ]
            },
            "railBreakdown": {
              "type": "object",
              "description": "Units funded per rail.",
              "properties": {
                "evm": {
                  "type": "integer"
                },
                "solana": {
                  "type": "integer"
                },
                "unknown": {
                  "type": "integer"
                }
              }
            }
          }
        },
        "joinLinks": {
          "type": "object",
          "properties": {
            "human": {
              "type": "string"
            },
            "agentPay": {
              "type": "string"
            },
            "status": {
              "type": "string"
            },
            "proof": {
              "type": "string"
            }
          }
        },
        "note": {
          "type": "string"
        }
      }
    }
  },
  "POST /pools/:id/pay": {
    "input": {
      "type": "http",
      "method": "POST",
      "pathParams": {
        "id": {
          "type": "string",
          "x-required": true
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "receipt": {
          "type": "object",
          "properties": {
            "payload": {
              "type": "object"
            },
            "signature": {
              "type": "string"
            },
            "algorithm": {
              "type": "string",
              "const": "HMAC-SHA256"
            },
            "canonicalization": {
              "type": "string",
              "const": "sorted-json"
            }
          },
          "required": [
            "payload",
            "signature"
          ]
        }
      }
    }
  },
};
