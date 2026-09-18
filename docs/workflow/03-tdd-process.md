# Test-Driven Development (TDD) Process

## Core Philosophy

**"Red-Green-Refactor, always."** Every feature, bugfix, and refactor follows this loop without exception. The mattpocock `/tdd` skill formalizes this discipline for AI-aided development.

### Why TDD Matters

- Feedback rate = speed limit (Pragmatic Programmer)
- Without automated feedback, the agent flies blind
- Tests serve as documented specifications
- Confidence to refactor + redesign
- Catches regressions before they propagate

## The Three Phases

### 1. RED: Write a Failing Test First

Before writing any production code:

1. **Understand the requirement** from the ticket/issue
2. **Write a test** that specifies the desired behavior
3. **Run the test** → it must FAIL
4. **Only then** write the minimum production code to make it pass

### 2. GREEN: Minimum Implementation

Make the test pass with the simplest possible code:

- No edge cases yet
- No generalization
- No over-engineering
- Just enough to satisfy the test

### 3. REFACTOR: Clean Up While Tests Stay Green

After the test passes:

- Improve code structure
- Rename variables for clarity
- Remove duplication
- Apply SOLID principles
- **Keep tests green** throughout

---

## TDD Workflow Per Ticket

For each ticket (CTW-001 through CTW-011):

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: Analyze requirement                              │
│  - Read ticket description                                │
│  - Check CONTEXT.md for vocabulary                        │
│  - Identify domain objects & invariants                   │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 2: Write test (RED)                                 │
│  - Place test in tests/                                   │
│  - Import support fakes (fakeRedis, fakeSheetStore etc.)  │
│  - Test exact, deterministic behavior                     │
│  - Run: node --import tsx --test tests/<file>.test.ts    │
│  - Verify: TEST FAILS                                     │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 3: Write minimum code (GREEN)                       │
│  - Implement just enough to pass test                     │
│  - Centralize pricing in src/pricing/ (invariant #1)      │
│  - Use getEnv() for all env vars (invariant #4)           │
│  - SanitizeForSheet for all text (invariant #3)           │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 4: Refactor                                         │
│  - Improve code structure                                 │
│  - Add docstrings/comments                                │
│  - Run tests again → ALL GREEN                            │
│  - Check invariants preserved                             │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
│  ✅ TICKET DONE: All tests pass, code clean, ready for    │
│   code review                                             │
└─────────────────────────────────────────────────────────┘
```

## Test Structure & Conventions

### Test File Placement

```
tests/
  pricing.test.ts        # Pricing math — centralized
  sanitize.test.ts       # Sanitizers/validators
  status-machine.test.ts # Forward-only status machines
  catalog.test.ts        # Catalog domain + S1 flow
  mockup-compositing.test.ts # Pixel-exact Sharp composite
  quota.test.ts          # Mockup quota per chat per month
  workflow.test.ts       # Durability, timing, durability
  timing.test.ts         # Mockup timing enforcement (25s webhook limit)
```

### Using Support Fakes

Always use fakes from `tests/support/` — never real Redis/Sheets in tests:

```typescript
// Example: testing order flow with fake Redis
import { fakeRedis } from "./support/fakeRedis"
import { OrderDraft } from "../src/conversation/draft"

describe("Order Draft Persistence", () => {
  let redis

  beforeAll(() => {
    redis = fakeRedis()
  })

  it("persists qty to sess", () => {
    const draft = new OrderDraft(redis, "tg:12345")
    draft.qty = 100
    draft.persist()
    
    const loaded = redis.get(`sess:tg:12345`)
    expect(loaded.qty).toBe(100)
  })
})
```

### Test Naming Conventions

- **Describe blocks**: Noun phrases describing the domain
- **It blocks**: Verb phrases describing expected behavior
- **Test names**: Complete sentences when read aloud

```typescript
describe("MOQ validation", () => {
  it("throws for orders below 50 pcs", () => {
    // test body
  })

  it("allows exactly 50 pcs", () => {
    // test body
  })
})
```

### Assertion Style

- Use `expect`.toBe() for exact equality
- Use `expect`.toBeCloseTo() for floating point
- Use `expect`.toThrow() for error conditions
- Use `expect`.toContain() for substring checks

### Test Isolation

Each test must be independent:

- No shared state between tests
- Use `beforeEach`/`afterEach` to reset state
- If using Redis mock: reset between tests
- If using date: mock with fixed timestamp

## Invariant Preservation in Tests

While writing tests, ensure these AGENTS.md invariants are tested:

| Invariant | Test Consideration |
|-----------|-------------------|
| **#1 Pricing centralized** | Tests import from `src/pricing/` only; no hardcoded amounts in test files |
| **#3 Money events don't fail silently** | Test that sheet write failures escalate + throw |
| **#4 Env validated once, fail-fast** | Test `getEnv()` throws on missing vars; test cold start |
| **#5 Security gates** | Test webhook secret verification; test admin gated by `ADMIN_CHAT_IDS` |
| **#6 Forward-only status machines** | Test status transitions only forward; reject backward |
| **#7 Below-MOQ rejection terminal** | Test no sheet row written, no admin ping for < 50 pcs |
| **#8 Click-first UX** | Test button interactions; minimize typed input tests |
| **#9 AI exception** | Test no AI in pricing/flow; only optional AI mockup visualization |

## Testing Durability & Timing

### Mockup Timing Enforcement

`tests/mockupTiming.test.ts` structurally enforces that slow mockup generation never runs inside the webhook handler. Key patterns:

- Mockup generation dispatched to `POST /api/mockup-delivery` (120s maxDuration)
- `waitUntil` for background completion
- Both triggers (order-flow + admin paid-approval) call delivery endpoint
- **Never** run slow generation inside grammY's 25s webhook budget

### Quota Testing

Tests cover:

- `MOCKUP_FREE_PER_MONTH` (3) free generations per chat per Asia/Kolkata calendar month
- `#4+` costs `MOCKUP_PAID_PRICE_INR` (₹20) with admin approval
- Commit-on-success: reservation decides free/paid (sticky per generation)
- Failure releases free slots; paid decisions never re-charge

### Workflow Durability

Tests verify:

- Status machine forward-only transitions
- Idempotent admin actions (SETNX)
- Below-MOQ is terminal (no sheet row, no admin ping)
- Cancel taxonomy: pre-qty vs post-qty vs no-payment

## Example TDD Cycle: CTW-001 (Tier Selection)

### Step 1: Write Test (RED)

```typescript
// tests/tier-selection.test.ts
import { getEnv } from "../src/config/env"
import { createBot } from "../src/bot"

describe("Tier Selection Flow", () => {
  const env = getEnv()

  it("presents tier selection buttons to new user", () => {
    const bot = createBot()
    // Test that /start offers tier selection
    expect(bot).toBeDefined()
  })

  it("stores selected tier in draft", () => {
    // Test draft persistence
    const draft = new (await import("../src/conversation/draft")).OrderDraft(
      {} as any,
      "tg:99999"
    )
    // ... test structure
  })
})
```

### Step 2: Run Test → FAIL

```bash
npm test  # node --import tsx --test "tests/tier-selection.test.ts"
# Expected: test fails because tier selection not implemented yet
```

### Step 3: Write Minimum Implementation (GREEN)

In `src/conversation/orderFlow.ts` or `src/conversation/keyboards.ts`:

```typescript
// S00: Tier selection step
const S00 = async (ctx: Context) => {
  await ctx.reply("Select your tier:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Basic - ₹500/pc", callback_data: "tier:basic" }],
        [{ text: "Premium - ₹800/pc", callback_data: "tier:premium" }],
        [{ text: "Enterprise - ₹1000/pc", callback_data: "tier:enterprise" }]
      ]
    }
  })
}
```

### Step 4: Refactor

- Add proper action handlers
- Add draft persistence
- Add navigation to next step
- Run tests → ALL GREEN

### Step 5: Code Review (`/code-review`)

Run Standards + Spec axis:
- Standards: buttons accessible, no typed input needed
- Spec: matches tier-to-product-id mapping in priceBook

---

## TDD Metrics & Guidelines

### Minimum Test Coverage

Aim for these minimums (per ticket/feature):

- **Happy path**: 1 test minimum
- **Edge cases**: At least 2 per feature (error, boundary)
- **Invariant checks**: Each AGENTS.md invariant tested somewhere

### Test Execution Speed

- All tests should run in < 30 seconds
- If tests are slow: check for real Redis/Sheet calls
- Use fakes, not real services

### Test Maintenance

- If production code changes: update tests to match
- If tests become overly complex: simplify implementation, not tests
- Deprecate tests only with team agreement (via retro)

## Debugging Hard Tests (`/diagnosing-bugs`)

When a test fails and the cause isn't obvious:

1. Run `/diagnosing-bugs` for disciplined debugging loop
2. Build feedback loop: test turns red → minimize → hypothesise → instrument → fix → regression-test
3. Check invariants - which one is being violated?
4. Look at recent changes - did something break the test?

---

## TDD Checklist (Per Ticket)

- [ ] Requirement analyzed from ticket
- [ ] Test written that fails (RED) - placed in `tests/`
- [ ] Test runs and fails as expected
- [ ] Minimum production code written (GREEN)
- [ ] Test passes after implementation
- [ ] Code refactored while tests stay green
- [ ] Full test suite runs: ALL PASS
- [ ] Invariants checked (AGENTS.md #1-9)
- [ ] Code review completed (`/code-review`)
- [ ] Ticket marked done, ready for merge

---

## TDD & The Holistic Process

TDD sits in the middle of the development loop:

```
┌───────────────────────────────────────┐
│  GRILL / RESEARCH → Requirements        │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  PLAN → Tickets (to-tickets)            │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  IMPLEMENT + TDD                        │
│   • Red-green-refactor loop            │
│   • Tests as specifications             │
│   • Invariants preserved                │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  REVIEW + ARCHITECTURE                  │
│   • /code-review (Standards + Spec)     │
│   • /improve-codebase-architecture      │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  DEPLOY + VERIFY                        │
│   • npm test → all passing              │
│   • Health check                        │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  RETRO + CONTINUE                       │
│   • What test patterns worked?          │
│   • Any new invariants to add?          │
└───────────────────────┬─────────────────┘
                      │
                      ▼
┌───────────────────────────────────────┐
│  NEXT TICKET                             │
└───────────────────────────────────────┘
```

---

## Common TDD Anti-Patterns to Avoid

| Anti-Pattern | Fix |
|-------------|-----|
| Writing code first, then test | Always RED first |
| Tests that are too broad | Test one behavior per test |
| depending on real Redis/Sheets in tests | Use fakes from `tests/support/` |
| Tests that break on refactor | Refactor tests alongside production code |
| Skipping RED phase "just this once" | Never skip - that's how bugs enter |
| Test-to-code coupling too tight | Tests should specify behavior, not implementation |
| Too many edge cases in first test | Start with happy path, add edges later |

---

## TDD Success Criteria

A TDD cycle is successful when:

- [ ] Test was written before production code
- [ ] Test fails before implementation (RED)
- [ ] Test passes after minimum implementation (GREEN)
- [ ] Code is cleaner after refactor
- [ ] All AGENTS.md invariants still hold
- [ ] Code review passes both axes
- [ ] Ticket done + ready for merge