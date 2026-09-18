# Testing & Deployment — Holistic Process

## Overview

This document covers the complete testing and deployment pipeline, integrating the mattpocock skills framework with the Custom Teamwear bot's specific requirements. It ensures the app ships as a **safe and scalable** Telegram bot.

---

## Phase 1: Test Suites & What They Cover

### 1.1 Test Suites Overview

| Test File | Focus | Key Invariants Covered |
|-----------|-------|----------------------|
| `tests/pricing.test.ts` | Pricing math | #1 Centralized pricing, #3 Money events don't fail silently |
| `tests/sanitize.test.ts` | Formula injection prevention | #5 Security gates, sanitizeForSheet |
| `tests/status-machine.test.ts` | Forward-only status transitions | #6 Status machines, terminal states |
| `tests/catalog.test.ts` | Catalog domain + S1 flow | #8 Click-first UX, domain model |
| `tests/mockup-compositing.test.ts` | Pixel-exact Sharp composite | #9 AI exception (deterministic proof) |
| `tests/quota.test.ts` | Mockup quota per chat per month | #9 Paid generation, free quota |
| `tests/workflow.test.ts` | Durability, timing, edge cases | #7 Below-MOQ, #3 Money events |
| `tests/timing.test.ts` | Mockup timing enforcement (25s webhook limit) | Structural enforcement |

### 1.2 Run All Tests

```bash
npm test  # node --import tsx --test "tests/**/*.test.ts"
```

### 1.3 Test Execution Speed

- All tests should complete in **< 30 seconds**
- If slower: check for real Redis/Sheet calls
- Always use fakes from `tests/support/`

---

## Phase 2: Pre-Deployment Verification Checklist

### 2.1 TypeScript & Lint

```bash
npm run typecheck  # tsc --noEmit (also aliased as lint)
```

- [ ] No TypeScript errors
- [ ] No `any` types (where avoidable)
- [ ] All invariants compile cleanly

### 2.2 Test Suites

```bash
npm test
```

- [ ] All 8 test suites pass
- [ ] No flaky tests
- [ ] Mock usage correct (no real Redis/Sheets)

### 2.3 Invariants Verification

Verify these **9 invariants** from AGENTS.md:

| # | Invariant | Verification |
|---|-----------|-------------|
| **1** | Pricing centralized | Only `src/pricing/` computes rupee amounts |
| **2** | One shared renderer | `src/shared/render.ts` used by both customer & admin cards |
| **3** | Money events don't fail silently | Sheet write failures escalate + throw; admin notifications have plain-text fallbacks |
| **4** | Env validated once, fail-fast | `src/config/env.ts` `getEnv()` validates at cold start; access only via `getEnv()` |
| **5** | Security gates | Webhook secret checked 100% requests; admin gated by `ADMIN_CHAT_IDS`; `sanitizeForSheet` strips formula injection |
| **6** | Forward-only status machines | Orders: `Pending Payment → Confirmed | Payment Issue` (terminal); both throw on invalid transitions |
| **7** | Below-MOQ rejection terminal | No sheet row, no admin ping for < 50 pcs |
| **8** | Click-first UX | Buttons everywhere; typed input only for qty, size, city, name, phone, logo/proof uploads |
| **9** | AI exception | No AI touches pricing/flow (exception: optional AI-styled mockup visualization) |

### 2.4 Skills Verification

- [ ] `skills-lock.json` present and up to date
- [ ] No EBUSY/lock files from previous skill installations
- [ ] Skills available at `.agents/skills/`

### 2.5 Code Quality

- [ ] No new Fowler smells (god class, mutable defaults, etc.)
- [ ] Proper error handling (no silent failures)
- [ ] No secrets hardcoded in source
- [ ] All user text runs through `sanitizeForSheet`

---

## Phase 3: Deployment Commands

### 3.1 Local Development

```bash
# From app directory
cd "D:\Work Code\Projects\custom team wear\app"

# Start dev server (with mockup delivery if needed)
npm run dev  # vercel dev

# Or just typecheck
npm run typecheck

# Run tests
npm test
```

### 3.2 Webhook Setup

```bash
# Set webhook (after local testing)
npm run set-webhook  # tsx scripts/set-webhook.ts

# Delete webhook
npm run delete-webhook  # tsx scripts/delete-webhook.ts

# Get webhook info
npm run webhook-info  # tsx scripts/webhook-info.ts
```

### 3.3 Production Deployment

```bash
# Deploy to Vercel
vercel prod

# Or via npm script (if configured)
vercel --prod
```

### 3.4 Post-Deployment Verification

After deployment, run through this checklist:

#### 3.4.1 Health Check

```
GET /api/health
```

Returns:
- `BUILD_STAMP` (verify it's current)
- Feature flags status
- Deploy-lag diagnosis

#### 3.4.2 Bot Flow Test

1. Start a new chat with the bot: `/start`
2. Verify flow: Tier → Catalog → Qty → Sizes → Print → City → Name → Phone → Timeline → Logo → Quote → Payment
3. At each step, buttons should work (click-first UX)
4. Typed input only where specified (qty counts, city, name, phone, logo upload)

#### 3.4.3 Google Sheets Verification

Check all 3 tabs have correct data:

- **Orders tab**: New row appended with order details
- **CatalogSelections tab**: Exact sourcePage/itemId/variantId recorded (for historic traceability)
- **MockupGenerations tab**: If mockups generated, generation record present

#### 3.4.4 Payment Flow Test

1. reach payment screen
2. Verify UPI QR generated
3. Amount = 50% advance + static QR
4. Test with different order quantities
5. Verify dynamic UPI URI generation

#### 3.4.5 Mockup Generation Test

1. Upload a logo (jpeg/png/webp, ≤8MB, ≤3/day/chat)
2. Verify mockup generation starts
3. Check free quota: first 3 per Asia/Kolkata calendar month free
4. #4+ should cost ₹20 with admin approval
5. Verify mockup uploaded to Vercel Blob
6. Verify screenshot sent to customer + admins

#### 3.4.6 Admin Actions

1. In admin chat, verify mockup generation records
2. Test ✅ Confirm button - should advance order
3. Test 🚩 Issue button - should flag order
4. Verify idempotency via `admin-action:<orderId>` SETNX

#### 3.4.7 Webhook Security

1. Send request without secret → should 200 ACK (but Telegram retries avoided)
2. Verify secret check on 100% of requests
3. Check no retry storms from Telegram

---

## Phase 4: Post-Deployment Monitoring

### 4.1 Error Monitoring (Sentry)

- Integrate `@sentry/node` for error tracking
- Monitor for:
  - Webhook timeout errors (should 200 ACK internally)
  - Redis connection failures
  - Google Sheets write failures
  - Mockup generation failures
  - UPI QR generation failures

### 4.2 Logs & Diagnostics

Check regularly:

```bash
vercel logs  # for deployment logs
```

- Webhook processing times
- Mockup generation dispatch times
- Redis operation latency
- Google Sheets API response times

### 4.3 Quota Monitoring

Track mockup generation quotas:

- Free: 3 per chat per Asia/Kolkata calendar month
- Paid: ₹20 per generation after quota exhausted
- Admin approval required for #4+

### 4.4 Skill Updates

Pull updated skills when available:

```bash
npx skills update
```

Review `skills-lock.json` for hash changes. If skills updated, re-run `/setup-matt-pocock-skills` to refresh configuration.

### 4.5 Rollback Procedure

If deployment fails or causes issues:

1. **Vercel auto-rolls back** on error by default
2. Check `vercel logs` for failure details
3. If database schema issue: revert schema, re-run migrations
4. If code bug: create hotfix branch, PR, merge
5. If env issue: fix `.env`/`vercel`, redeploy

### 4.6 Retrospective

Run `/retro` after first week in production:

- What went well?
- What went poorly?
- Any new invariants needed?
- Any skills to add/remove?
- Action items for next cycle?

---

## Phase 5: Scalability Considerations

### 5.1 Redis Clustering

- Upstash Redis used for sessions/dedupe/locks
- Ensure cluster mode enabled for production scale
- Monitor key memory usage: `sess:<chatId>`, `oid:<YYMMDD>`, `mockupgen:*`

### 5.2 Google Sheets Rate Limiting

- `google-spreadsheet` library handles rate limiting
- Our `sheets/` client adds safeAppend with retry logic
- Monitor for quota exceeded errors

### 5.3 Vercel Blob Storage

- Mockup images stored via `@vercel/blob`
- Monitor storage usage and costs
- Set appropriate cache headers

### 5.4 Rate Limiters

- `ratelimit:ctw*` - sliding-window limiter for bot commands
- `ratelimit:mockup*` - limiter for mockup generation
- Configure thresholds in `src/session/`)

### 5.5 Session Management

- Sessions: `sess:<chatId>` with 24h TTL
- Order IDs: `oid:<YYMMDD>` with 48h TTL (INCR → `CTW-YYMMDD-nn`)
- Dedupe: `upd:<updateId>` with 24h TTL (SETNX)
- Concurrency: `busy:<chatId>` with 90s TTL

### 5.6 Multi-Tenancy

- Chat IDs stored as `"tg:<id>"` prefix strings
- Future `wa:` prefix for WhatsApp Cloud API portability
- All env vars accessed via `getEnv()` (fail-fast on missing)

---

## Phase 6: Holistic Process Flow

```mermaid
flowchart TD
    A[Start: New Code Change] --> B[Write Test (RED)]
    B --> C{Test Fails?}
    C -- No --> B[Fix test, not code]
    C -- Yes --> D[Write Minimum Implementation]
    D --> E{Test Passes?}
    E -- No --> D[Refactor implementation]
    E -- Yes --> F[Refactor Code]
    F --> G{All Tests Pass?}
    G -- No --> F[More refactoring]
    G -- Yes --> H[Code Review (/code-review)]
    H --> I{Review Pass?}
    I -- No --> F[Revise code]
    I -- Yes --> J[Run Full Test Suite]
    J --> K{All Pass?}
    K -- No --> J[Debug + Fix]
    K -- Yes --> L[Deploy]
    L --> M[Post-Deployment Verify]
    M --> N{All OK?}
    N -- No --> O[Rollback / Hotfix]
    N -- Yes --> P[Retrospective (/retro)]
    P --> Q[Next Change]
    
    style A fill:#e1f5fe
    style H fill:#c8e6c9
    style O fill:#ffcdd2
    style P fill:#ffe0b2
```

---

## Phase 7: Emergency Procedures

### 7.1 Production Outage

If bot stops working or errors occur:

1. Check `/api/health` endpoint
2. Check Vercel logs for errors
3. Check Sentry for error spikes
4. Verify Redis connectivity
5. Check Google Sheets API status
6. Review recent deployments

### 7.2 Quick Fix Commands

```bash
# Redeploy latest
vercel redeploy

# Rollback to previous
vercel rollback

# Check current deployment
vercel ls
```

### 7.3 Contact Escalation

- **Bot not responding**: Check webhook config, Redis, Telegram API status
- **Payment issues**: Verify UPI QR generation, amount calculation
- **Mockup failures**: Check quota, admin approval flow
- **Sheets sync issues**: Check credentials, safeAppend logic

---

## Summary: The Complete Holistic Loop

```
┌──────────────────────────────────────────────────────────────┐
│  1. GRILL / RESEARCH                                         │
│  → Requirements "in stone" + CONTEXT.md + ADRs               │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  2. PLAN → TICKETS (to-tickets)                              │
│  → Tracer-bullet tickets with blocking edges                  │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  3. IMPLEMENT + TDD                                           │
│  • Red-green-refactor loop                                    │
│  • Tests as living specifications                             │
│  • All 9 AGENTS.md invariants preserved                       │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  4. REVIEW + ARCHITECTURE                                     │
│  • /code-review (Standards + Spec)                           │
│  • /improve-codebase-architecture (every few days)            │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  5. DEPLOY + VERIFY                                           │
│  • npm run typecheck                                          │
│  • npm test (all suites pass)                                 │
│  • /api/health check                                          │
│  • Bot flow test (end-to-end)                                 │
│  • Google Sheets verification (3 tabs)                        │
│  • Payment + mockup flow test                                 │
│  • Admin actions test (Confirm/Issue)                         │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  6. RETRO + CONTINUE                                          │
│  • /retro                                                     │
│  • Skill updates (npx skills update)                          │
│  • Docs sync                                                  │
│  • Next ticket from backlog                                   │
└──────────────────────────────────────────────────────────────┘
```

---

**Key Guarantee**: Following this process ensures the Custom Teamwear bot ships as a **safe, scalable, maintainable** application where:

- Pricing is always centralized and correct
- Money events never fail silently
- Security gates are server-side enforced
- Status machines are forward-only and deterministic
- Below-MOQ rejection is terminal (no spam)
- Click-first UX is maintained throughout
- AI only touches optional visualization, not proofs
- All events are logged, observable, and rollback-safe