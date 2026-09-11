# Project Structure

## Current State
This repository is a fully implemented, click-first Telegram bot on Vercel Serverless with Upstash Redis, Google Sheets CRM, Sharp deterministic mockups, and Vercel Blob storage.

```
custom team wear/app/
├── AGENTS.md                  # Primary AI agent instructions & codebase manual
├── README.md                  # Human developer setup and deployment instructions
├── package.json               # Dependencies and scripts (test, typecheck, set-webhook)
├── tsconfig.json              # TypeScript ESM configuration
├── vercel.json                # Vercel serverless routing config
│
├── api/                       # Vercel Serverless Function Endpoints
│   ├── webhook.ts             # Main Telegram webhook entry point (fast-ACK, secret check, dedupe)
│   ├── health.ts              # Health check & feature flag deploy verification (/api/health)
│   ├── heartbeat.ts           # Cron/uptime ping endpoint
│   └── mockup-delivery.ts     # Asynchronous mockup delivery webhook
│
├── src/                       # Application Source Code
│   ├── admin/                 # Admin operations (actions.ts, notify.ts)
│   ├── bot/                   # Bot initialization & grammY pipeline (index.ts, context.ts)
│   ├── catalog/               # Catalog data & resolution (index.ts, types.ts, catalog.generated.json)
│   ├── config/                # Environment validation (env.ts), Sentry, version stamps
│   ├── conversation/          # Interactive bot conversation flows (orderFlow.ts, keyboards.ts, copy.ts)
│   ├── mockup/                # Garment mockup engine (composite.ts, zones.ts, quota.ts, workflow.ts)
│   ├── pricing/               # Deterministic Pricing Engine (index.ts, priceBook.ts)
│   ├── qr/                    # Dynamic UPI QR generation (index.ts)
│   ├── session/               # Redis storage, state machine, locking (statusMachine.ts, redisClient.ts)
│   ├── shared/                # Shared types, card renderer (render.ts), sanitizers (sanitize.ts)
│   ├── sheets/                # Google Sheets CRM (client.ts, safeAppend.ts, schemas)
│   └── storage/               # Vercel Blob permanent storage (blob.ts)
│
├── docs/                      # Deep-Dive System Documentation
│   ├── ARCHITECTURE.md        # Deep-dive architecture & Mermaid data flow diagrams
│   ├── STATE_MACHINE_AND_FLOWS.md # Conversation states & transition tables (S00–S12)
│   ├── CATALOG_AND_MOCKUP_SYSTEM.md # Catalog extraction & Sharp compositing engine
│   ├── CODEBASE_MAP.md        # Complete index of files, types, and functions
│   └── DEVELOPER_CHEATSHEET.md# How-To recipes for common tasks
│
├── scripts/                   # Maintenance & Deployment CLI Scripts
│   ├── set-webhook.ts         # Register Telegram webhook with secret token
│   ├── delete-webhook.ts      # Unregister Telegram webhook
│   ├── webhook-info.ts        # Inspect live Telegram webhook status
│   └── generate-catalog.ts    # Re-extract catalog items from PDFs in quality/
│
├── tests/                     # Comprehensive Unit & Contract Tests (102+ tests)
│   ├── pricing.test.ts        # Price calculation & MOQ verification
│   ├── statusMachine.test.ts  # Forward-only status transition enforcement
│   ├── sanitize.test.ts       # Formula injection sanitization tests
│   ├── catalog.test.ts        # Catalog resolution and item lookups
│   ├── deterministicMockup.test.ts # Sharp image compositing tests
│   ├── mockupQuota.test.ts    # Monthly quota & Kolkata boundary tests
│   ├── mockupWorkflow.test.ts # End-to-end mockup generation lifecycle
│   └── support/               # FakeRedis, FakeSheetStore test doubles
│
├── assets/                    # Static Assets (catalog garment photos, mockup templates)
└── quality/                   # Source Brand Catalog PDFs (Basic, Standard, Premium)
```

## Architectural Invariants
- **Zero AI for Conversation & Pricing**: No LLMs or NLP. Every screen is a deterministic template, every price is a price book lookup.
- **Adapter isolation**: Channel interaction details are isolated in `src/bot/` and `src/conversation/` to keep a future WhatsApp adapter portable.
- **Pricing is centralized**: `src/pricing/` is the single computational source of truth for all monetary values.
- **Shared rendering**: Customer quote card and admin card are produced by `renderQuoteCard()` and `renderAdminCard()` in `src/shared/render.ts`.
- **State machine forward-only**: State moves forward only through `OrderStatus` in `src/session/statusMachine.ts`.
- **Sanitized CRM logging**: Formula injection sanitized via `sanitizeForSpreadsheet()`.
