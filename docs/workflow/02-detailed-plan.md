# Detailed Development Plan

## Prerequisites

Before starting this phase, ensure:

- [ ] `01-knowledge-base-setup.md` completed and signed off
- [ ] Requirements documented in `docs/requirements/requirements.md`
- [ ] Architecture documented in `docs/architecture/architecture.md`
- [ ] CONTEXT.md created with shared vocabulary
- [ ] ADRs written for all key decisions
- [ ] `/setup-matt-pocock-skills` run and configured
- [ ] Issue tracker (GitHub/Linear/local) configured with triage labels
- [ ] Issue tracker has project board ready for tickets

## Phase 1: Ticket Breakdown (`/to-tickets`)

### 1.1 Run Ticket Decomposition

```
/to-tickets
```

This breaks the spec/tickets into tracer-bullet tickets, each declaring its blocking edges.

### 1.2 Ticket Categories

Tickets are organized by flow step (per `orderFlow.ts` S00-S11):

| Ticket | Description | Blocking On |
|--------|-------------|-------------|
| **CTW-001** | Tier selection (S00) | Knowledge base complete |
| **CTW-002** | Catalog selection (S1) | CTW-001 done |
| **CTW-003** | Quantity input (S2) | CTW-002 done |
| **CTW-004** | Size split (S3) | CTW-003 done |
| **CTW-005** | Print method (S4) | CTW-004 done |
| **CTW-006** | City input (S5) | CTW-005 done |
| **CTW-007** | Name input (S6) | CTW-006 done |
| **CTW-008** | Phone input (S7) | CTW-007 done |
| **CTW-009** | Timeline selection (S8) | CTW-008 done |
| **CTW-010** | Multi-logo loop (S9) | CTW-009 done |
| **CTW-011** | Order assembly & quote (S10-S11) | CTW-010 done |

### 1.3 Ticket Format

Each ticket markdown file in `docs/tickets/` includes:

```markdown
# CTW-001 - Tier Selection

## Blocking Edges
- 01-knowledge-base-setup.md signed off
- Issue tracker ready
- CONTEXT.md created

## Definition of Done
- Bot presents tier selection buttons
- Selection persists to Redis draft
- Navigation to next step works

## Acceptance Criteria
- [ ] Three tier options displayed as buttons
- [ ] Clicking a tier advances to catalog
- [ ] Tier value stored in sess:<chatId>

## Implementation Notes
- Use keyboards.ts for button layout
- Persist via sess persist()
- Follow click-first UX invariant #8

## Domain Model
- Vocabulary: tier (from CONTEXT.md)
- Maps to: pricing ProductId via priceBook
```

### 1.4 Ticket Blocking Graph

Tickets form a DAG (directed acyclic graph):

```
CTW-001 → CTW-002 → CTW-003 → CTW-004 → CTW-005 → CTW-006 → CTW-007 → CTW-008 → CTW-009 → CTW-010 → CTW-011
```

Each ticket **must** complete before the next starts (forward-only status machine invariant #6).

### 1.5 Ticket Tracking

- Use GitHub Issues with labels from `/setup-matt-pocock-skills`
- Or local file: `docs/tickets/local-tickets.md`
- Each ticket has: assignee, status (todo/in-progress/done), blocked-by

## Phase 2: Implementation with TDD (`/tdd`)

### 2.1 Red-Green-Refactor per Ticket

For **each ticket**, follow:

1. **Red**: Write test that fails (specifies desired behavior)
2. **Green**: Minimum implementation to pass test
3. **Refactor**: Clean up, keep tests green

### 2.2 Test Structure

Tests live in `tests/` with support fakes in `tests/support/`:

```
tests/
  pricing.test.ts        # Pricing math
  sanitize.test.ts      # Sanitizers/validators
  status-machine.test.ts # Status machine
  catalog.test.ts       # Catalog domain + S1 flow
  mockup-compositing.test.ts # Pixel-exact compositing
  quota.test.ts         # Mockup quota
  workflow.test.ts      # Durability, timing
  timing.test.ts        # Mockup timing enforcement
```

### 2.3 Test Fakes

Use `tests/support/` fakes:

- `fakeRedis` - Redis mock
- `fakeSheetStore` - Google Sheets mock
- `testEnv` - Environment validation mock
- MockupSheetStore/BlobUploader injection seams

### 2.4 Example Test Pattern

```typescript
// tests/pricing.test.ts
import { getEnv } from "../src/config/env"
import { calculatePrice } from "../src/pricing"

describe("Pricing Math", () => {
  const env = getEnv()

  it("calculates 50% advance correctly", () => {
    const result = calculatePrice(200, env.priceBook.advancePercentage)
    expect(result).toBe(100) // 50% of 200
  })

  it("applies MOQ gate", () => {
    expect(() => calculatePrice(49, env.priceBook.minOrderQuantity)).toThrow(
      "MOQ 50 hard gate"
    )
  })
})
```

### 2.4 TDD Workflow per Ticket

```
┌─────────────────────────────────────┐
│  RED: Write failing test              │
│  (specifies exact behavior)           │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  GREEN: Minimum implementation        │
│  to pass test                         │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  REFACTOR: Clean up code              │
│  while keeping tests green            │
└───────────────┬───────────────────────┘
              │
              ▼
│  Run tests → PASS → Move to next ticket
```

### 2.5 Testing Invariants (from AGENTS.md)

While implementing, ensure these are never violated:

1. **Pricing centralized** - only in `src/pricing/`
2. **One shared renderer** - `src/shared/render.ts` for both customer & admin cards
3. **Money events don't fail silently** - escalate to admin chats, throw on failure
4. **Env validated once, fail-fast** - use `getEnv()` only
5. **Security gates** - webhook secret checked, admin gated by `ADMIN_CHAT_IDS`
6. **Forward-only status machines** - orders: `Pending Payment → Confirmed | Payment Issue`
7. **Below-MOQ rejection is terminal** - no sheet row, no admin ping
8. **Click-first UX** - buttons everywhere, typed input only for specific fields
9. **AI exception** - no AI touches pricing/flow (only optional AI mockup visualization)

## Phase 3: Code Review (`/code-review`)

### 3.1 Two-Axis Review

For each PR, run `/code-review` with:

#### Standards Axis

- Follows repo coding standards
- Fowler smell baseline (god class, mutable default args, etc.)
- Type safety (no `any`, proper types)
- Error handling (no silent failures)
- Security (no secrets hardcoded, sanitization applied)

#### Spec Axis

- Faithfully implements originating issue/spec
- Matches CONTEXT.md vocabulary
- ADRs updated if architecture changed
- Invariants preserved (see Section 2.5)

### 3.2 Parallel Sub-Agents

Run code-review as parallel sub-agents so neither pollutes the other:

```
agent1 reviews Standards axis
agent2 reviews Spec axis
→ Combine feedback → Revise → Re-review
```

### 3.3 Code Review Commands

```bash
# Create pending review (doesn't submit)
npx opencode /code-review --method create

# Submit pending review
npx opencode /code-review --method submit_pending

# Delete pending review
npx opencode /code-review --method delete_pending
```

### 3.4 Idempotency

Admin actions use `admin-action:<orderId>` SETNX for idempotency (invariant #5).

## Phase 4: Architecture Improvement (`/improve-codebase-architecture`)

### 4.1 Regular Surveys

Run `/improve-codebase-architecture` once every few days to:

- Survey codebase for deepening opportunities
- Present visual HTML report
- Grill through selected candidate

### 4.2 Deep Module Goals

Aim for modules that:

- "Allow a lot of functionality to be accessed through a simple interface" (Ousterhout)
- Place behavior at clean seams
- Testable through that interface
- Low coupling, high cohesion

### 4.3 Opportunistic Refactoring

When touching code in any ticket:

1. Identify module being modified
2. Ask: "Can this be made deeper?"
3. If yes: refactor, update tests, verify
4. If no: proceed with minimum change

### 4.4 Report Format

The skill generates an HTML report showing:

- Current module depth analysis
- Candidates for deepening
- Grilling questions for each candidate
- Recommended actions

## Phase 5: Pre-Deployment Verification

### 5.1 Checklist

Before any deployment:

- [ ] `npm run typecheck` passes (no TypeScript errors)
- [ ] `npm test` all tests passing
- [ ] `npm run lint` passes (aliased to typecheck)
- [ ] CONTEXT.md up to date
- [ ] All ADRs current
- [ ] Issue tracker tickets all done/blocked-resolved
- [ ] No EBUSY/lock files (clear `.agents\skills\` if needed)
- [ ] `getEnv()` validates all required vars at cold start
- [ ] Webhook secret validated on 100% of requests
- [ ] Below-MOQ orders: no sheet row, no admin ping (invariant #7)
- [ ] Click-first UX: buttons everywhere (invariant #8)

### 5.2 Deployment Commands

```bash
# From app directory
cd "D:\Work Code\Projects\custom team wear\app"

# Typecheck/lint
npm run typecheck

# Run tests
npm test  # node --import tsx --test "tests/**/*.test.ts"

# Set webhook (after local testing)
npm run set-webhook

# Deploy to Vercel
vercel prod

# Or dev mode
npm run dev
```

### 5.3 Post-Deployment Verification

1. Check `/api/health` for deploy-lag diagnosis
2. Send test message to bot → verify flow starts
3. Create test order through full flow
4. Verify Google Sheets: Orders tab has new row
5. Verify CatalogSelections tab has selections recorded
6. Verify MockupGenerations tab if mockups generated
7. Test admin actions: Confirm + Issue buttons
8. Test payment flow: UPI QR generation, amount calculation
9. Test mockup generation (free quota first, then paid if >3 free)

### 5.4 Health Check Endpoint

`/api/health` returns build/feature info including:
- `BUILD_STAMP` (up-to-date?)
- Feature flags
- Deploy lag diagnosis

### 5.5 Rollback Plan

If deployment fails:

1. Vercel automatically rolls back on error
2. Check `vercel logs` for failure details
3. If database changes caused issue: revert schema, re-run migrations
4. If code bug: hotfix branch, PR, merge
5. Retro: what went wrong, how to prevent

## Phase 6: Post-Deployment Improvement

### 6.1 Monitoring

After deployment, monitor:

- Error rates (Sentry integration)
- Webhook timeout issues
- Redis connectivity
- Google Sheets write failures
- Mockup generation quotas

### 6.2 Skill Updates

Pull updated skills:

```bash
npx skills update
```

Review `skills-lock.json` for hash changes.

### 6.3 Continuous Retros

Run `/retro` after first week in production:

- What went well?
- What went poorly?
- Action items for next cycle?
- Any new skills to add/remove?

### 6.4 Documentation Sync

Keep `docs/` synchronized:

- If code changes, update relevant docs
- Delete obsolete documents
- Add new documents for new capabilities
- Quarterly review of all docs

---

## Summary: Ticket-by-Ticket Process

```
For each ticket CTW-XXX:

1. ✅ Verify blocking tickets complete
2. ✅ Write test (RED) - specifies exact behavior
3. ✅ Run test → FAIL (expected)
4. ✅ Write minimum implementation (GREEN)
5. ✅ Run test → PASS
6. ✅ Refactor code (keep tests green)
7. ✅ Run full test suite → ALL PASS
8. ✅ Code review (/code-review) - Standards + Spec
9. ✅ Merge to main / deploy
10. ✅ Update CONTEXT.md if vocabulary changed
11. ✅ Update ADRs if architecture changed
12. ✅ Retro item for next cycle
```

**Key Principle**: Each ticket is a vertical slice end-to-end, not a layered implementation. This aligns with the `/to-tickets` skill's tracer-bullet approach.

---

**Exit Taxonomy** (from AGENTS.md invariants):

- Pre-qty cancels: discard silently
- Post-qty cancels: write "Lead — Abandoned" row
- Qty > 300: "📞 Call Me" → "Lead — High-Value Callback"
- No-payment cancel: "Lead — No Payment"
- Mockup failures: release free slots, never re-charge