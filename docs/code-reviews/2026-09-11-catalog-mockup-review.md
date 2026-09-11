# Code Review — Catalog Pipeline + Mockup Subsystem (2026-09-11)

**Scope:** All uncommitted working-tree changes on top of `d6b9219` ("Add AI logo
mockup generation feature") — generated catalog pipeline (`src/catalog/`,
`scripts/generate-catalog.ts`, catalog selection flow), deterministic mockup
subsystem (`src/mockup/*`, `src/storage/blob.ts`, `api/mockup-delivery.ts`,
`api/health.ts`), chat lock, 50% advance pricing, new test suites, plus the new
`AGENTS.md`.

**Method:** independent reviewer subagent (fresh context, reviewed base→working-tree
diff + full source reads, ran typecheck + tests). Findings verified against the code
before fixes were applied.

**Reviewer verdict (pre-fix):** *Not ready to merge — with fixes.* Core subsystems
rated "excellent and well-tested"; two functional defects blocked merge.

---

## Findings and resolution

### ✅ Fixed — Critical

#### 1. Over-quota paid mockup never told the customer (proof hijack)
- **Where:** `src/conversation/orderFlow.ts` (mockup step), `src/mockup/workflow.ts`
- **What:** When the free monthly quota was exhausted, `startMockupGeneration`
  returned `payment-required`, but the flow only notified *admins*. The customer saw
  "generating…" forever. Worse, `mockupgen:pending:<chatId>` was already set, so the
  customer's *next* photo (a logo revision, an unrelated image) was silently hijacked
  as a ₹20 "payment proof" and forwarded to admins — a money-flow confusion bug.
- **Fix:** the order-flow mockup step no longer runs generation inline; it persists
  the order snapshot and dispatches to `POST /api/mockup-delivery` via
  `triggerMockupDelivery`. That endpoint handles the `payment-required` outcome by
  messaging the customer (`COPY.mockupPaidRequired`) *and* the admins.

#### 2. Dead dispatch infrastructure + generation running inside the webhook budget
- **Where:** `src/mockup/deliverTrigger.ts` (zero production callers),
  `api/mockup-delivery.ts`, `src/conversation/orderFlow.ts`,
  `src/mockup/paidGeneration.ts`
- **What:** The designed fire-and-forget dispatch to the 120s `mockup-delivery`
  function was never wired in — deterministic generation (Telegram downloads + Sharp
  composite + Blob upload + sends, plausibly 5–30s on a cold start) ran inline under
  grammY's 25s webhook budget in *both* the order-flow path and the admin
  paid-approval path. The approve path was the riskier one: `claimDecision` had
  already consumed the idempotency guard, so an inline timeout would leave the record
  stuck in `approved` with no retry. Comments in `api/webhook.ts` falsely claimed the
  dispatch architecture was in effect.
- **Fix:** both triggers now dispatch via `triggerMockupDelivery`:
  - `orderFlow.ts` mockup step → dispatch after `saveOrderSnapshot`
  - `approvePaidGeneration` → dispatch after the atomic approve claim, behind an
    injectable seam `__setAfterApprovalDeliverForTests` (tests run delivery
    synchronously with fakes)

### ✅ Fixed — Important

#### 3. Webhook dedupe ran before secret validation (DoS vector)
- **Where:** `api/webhook.ts`
- **What:** `claimUpdate(update_id)` executed before grammY's secret-token check. An
  unauthenticated request could claim arbitrary/future `update_id`s into the 24h
  dedupe SETNX set, causing *legitimate* updates to be silently dropped as duplicates.
- **Fix:** `x-telegram-bot-api-secret-token` is now validated (timing-safe
  `crypto.timingSafeEqual`) **before** any Redis write; grammY still re-checks the
  secret internally.

#### 4. Stale payment-proof route swallowed customer messages
- **Where:** `src/bot/index.ts` (top-level `bot.on("message")`)
- **What:** If a chat had a pending paid mockup but `attachPaymentProof` rejected the
  photo (stale index, already-decided generation), the handler returned without
  replying — the customer's message vanished.
- **Fix:** only short-circuit on `result.ok`; otherwise fall through to
  `conversation.enter("orderFlow")`.

### ✅ Addressed — Minor

#### 5. Stale comments contradicting the pivot to deterministic proofs
Corrected header comments in `src/mockup/deliver.ts`, `workflow.ts`,
`deliverTrigger.ts`, `api/mockup-delivery.ts`, and the `BLOB_READ_WRITE_TOKEN`
docstring in `src/config/env.ts` (Blob storage is mandatory for proofs).

### 🕐 Deferred

| # | Issue | Why deferred |
|---|---|---|
| Q1 | **Quota free-slot TOCTOU** across concurrent requests from the same chat — two parallel generations can both win "free". Bounded loss: at most one unpaid ₹20 mockup per race. | Needs a Lua/INCR-based atomic claim; low frequency, acceptable risk. Revisit if paid volume grows. |
| Q2 | **S7 phone step cancel trap** — after 2 invalid attempts only the Cancel button is accepted; a subsequently correct number is rejected forever. | UX papercut, no data risk; backlog. |
| Q3 | `INTERNAL_MOCKUP_SECRET` falls back to `WEBHOOK_SECRET` — internal endpoint's blast radius equals the webhook secret's. | Acceptable for dev/MVP; require the explicit secret before scaling. |
| Q4 | `generationStore.save()` swallows the MockupGenerations sheet-mirror failure silently (`.catch(() => {})`). | Audit-only tab (not a money event); add a `console.error` next touch. |

## What the review confirmed as good
- Forward-only generation state machine + SETNX idempotency everywhere
- Commit-on-success quota with sticky per-generation free/paid decisions (retries never re-charge)
- Timing-safe secret compare on the internal endpoint; server-side admin gating; forged-callback defense in catalog selection
- Deterministic Sharp compositor with pixel-exact tests; storage-before-send semantics
- Pricing invariant intact — catalog maps to `ProductId` only; the 50% advance change renders identically in customer and admin cards via the shared renderer

## Test/verification after fixes
- `npm run typecheck` — clean
- `npm test` — **104/104 pass**, including:
  - updated `mockupWorkflow.test.ts` / `mockupDurability.test.ts` using the
    `__setAfterApprovalDeliverForTests` seam
  - **new structural guards** in `mockupTiming.test.ts`:
    - `orderFlow` must dispatch via `triggerMockupDelivery` and must NOT call
      `startMockupGeneration(order)` inline
    - the paid-approval path must dispatch and must NOT call
      `deliverMockupForOrder()` inline
    - `api/mockup-delivery.ts` must message the customer when over quota

## Documentation updated
- **`AGENTS.md`** (new) — AI-facing project guide: invariants, repo map, flow,
  mockup subsystem, Redis key conventions (incl. `mockupquota:*`,
  `mockupgen:decision:*`), serverless gotchas, commands, common tasks.
- Header comments reconciled with the actual dispatch architecture.

**Status: all Critical + Important findings resolved; changes remain uncommitted
in the working tree pending commit.**
