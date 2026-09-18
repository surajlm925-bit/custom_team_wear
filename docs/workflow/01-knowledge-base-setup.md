# Knowledge Base Setup & Research Framework

## Philosophy

This project uses the **mattpocock skills framework** to structure development. The core principle is: *align first, build second*. We invest time upfront in research and requirement crystallization to avoid rework later.

### Why This Matters

- The skills repo emphasizes: "No-one knows exactly what they want" (Pragmatic Programmer)
- Misalignment is the most common failure mode in software development
- A shared language and documented decisions (CONTEXT.md, ADRs) pay off session after session

## Phase 1: The Grilling Session (`/grill-me`)

### 1.1 Run the Grilling Session

Before writing any code or docs, run:

```
/grill-me
```

This will relentlessly interview you about your plan or design until every branch of the design tree is resolved. Use this:

- **Non-code uses**: `/grill-me` directly
- **Code projects**: `/grill-with-docs` (adds shared language building + CONTEXT.md updates)

### 1.2 Outputs from Grilling

The grilling session produces:

- **Shared vocabulary** for the project
- **Decision tree** with all branches resolved
- **Preliminary CONTEXT.md** with domain terms
- **ADRs** (Architecture Decision Records) for key decisions

### 1.3 Document the Outcomes

Create `docs/workflow/01-knowledge-base-setup.md` (this file) capturing:

- All questions asked and answers given
- Design decisions made
- Open questions that need follow-up
- Domain glossary terms

## Phase 2: Deep Research & Back-and-Forth

### 2.1 Research Plan

After grilling, create a research plan documenting:

- What needs to be researched (technologies, patterns, integrations)
- Source priorities (primary > secondary)
- Trust thresholds for sources

### 2.2 Conduct Research

Use the `/research` skill to:

- Investigate questions against high-trust primary sources
- Capture findings as cited Markdown files in the repo
- Run as a background agent if needed

### 2.3 Iterative Refinement

The research phase is **iterative**:

1. Research → Findings → Grill session → Refine requirements → Research more
2. Repeat until requirements are "in stone"
3. Document each iteration in `docs/workflow/`

### 2.4 Final Requirements Document

When requirements are crystallized, create:

- `docs/requirements/requirements.md` - formal requirements specification
- `docs/architecture/architecture.md` - high-level architecture
- Update `CONTEXT.md` with the shared vocabulary

## Phase 3: Setup the Engineering Skills (`/setup-matt-pocock-skills`)

### 3.1 Run Setup

Once requirements are set:

```
/setup-matt-pocock-skills
```

This will ask you to:

- Choose issue tracker (GitHub, Linear, or local files)
- Define triage labels
- Set up docs/local file layout

### 3.2 Skill Configuration

The setup creates:

- `.agents/skills/` - the 37 installed skills
- `skills-lock.json` - tracks installed skill hashes
- Configuration for: triage, code-review, implement, to-spec, to-tickets, etc.

### 3.3 Project-Specific ADRs

Create ADRs in `docs/architecture/adr/` for:

- Technology stack choices
- Architecture decisions
- Non-functional requirements
- Any decision with reversibility trade-offs

## Phase 4: Planning with Tracer Bullets (`/to-tickets`)

### 4.1 Break Down Work

Use `/to-tickets` to break the spec/tickets into tracer-bullet tickets:

- Each ticket declares its blocking edges
- Written as text in a local file OR native blocking links on the issue tracker
- Focus on vertical slices (end-to-end, not layered)

### 4.2 Ticket Format

Each ticket should include:

- **Blocking edges** - what this ticket depends on
- **Definition of done** - concrete, testable criteria
- **Acceptance criteria** - specific, measurable requirements
- **Domain model impact** - which terms/concepts from the shared vocabulary

### 4.3 Example Ticket Structure

```markdown
# Ticket: CTW-001 - Core Order Flow

## Blocking Edges
- Requires: knowledge-base-setup.md completed
- Requires: CONTEXT.md created
- Requires: triage labels configured

## Definition of Done
- Order flow step S00 (tier) works end-to-end
- All buttons functional, no typed input required
- MOQ 50 validation gate works

## Acceptance Criteria
- User can select tier via buttons
- Navigation to catalog works
- Price displays correctly

## Domain Model Impact
- Uses: tier, catalogItem, priceBook ProductId
- Vocabulary: from CONTEXT.md shared language
```

## Phase 5: Testing Driven Development (`/tdd`)

### 5.1 Red-Green-Refactor Loop

Every feature follows this loop:

1. **Red**: Write a failing test first
2. **Green**: Make the test pass (minimum implementation)
3. **Refactor**: Clean up while keeping tests green

### 5.2 Test Placement

- **Unit tests**: `tests/` directory, alongside fakes in `tests/support/`
- **Integration tests**: Test real interactions (Redis, Sheets, but with fakes)
- **E2E**: Manual QA on Telegram per README §6 (not automated)

### 5.3 Testing Guidance from Skills

The `/tdd` skill provides:

- Red-green-refactor discipline
- Guidance on what makes good/bad tests
- Phase-by-phase debugging loop (`/diagnosing-bugs` available for hard bugs)

### 5.4 Test Examples from This Repo

Refer to `tests/` for existing test suites covering:

- Pricing math
- Sanitizers/validators
- Status machine
- Catalog domain + S1 flow
- Mockup compositing (pixel-exact)
- Quota, workflow, durability, timing

## Phase 6: Implementation (`/implement`)

### 6.1 Driving Implementation

Use `/implement` to build the work described by specs/tickets, driving `/tdd` at pre-agreed seams and closing out with `/code-review` before committing.

### 6.2 Code Review Standards

Use `/code-review` (two-axis: Standards + Spec):

- **Standards**: Does it follow repo coding standards + Fowler smell baseline
- **Spec**: Does it faithfully implement the originating issue/spec?

### 6.3 Parallel Review

Run code-review as parallel sub-agents so neither pollutes the other.

## Phase 7: Codebase Architecture Improvement (`/improve-codebase-architecture`)

### 7.1 Regular Surveys

Run `/improve-codebase-architecture` once every few days to:

- Survey the codebase for deepening opportunities
- Present as visual HTML report
- Grill through whichever candidate you pick

### 7.2 Deep Modules Philosophy

Key principles from the skills:

- "The best modules are deep. They allow a lot of functionality to be accessed through a simple interface." (John Ousterhout)
- Invest in design every day
- Care about codebase design - agents accelerate software entropy

### 7.3 Opportunistic Refactoring

- When touching code, ask: "Can this module be made deeper?"
- Look for interfaces that could be simplified
- Test coverage should guide refactoring (not the other way around)

## Phase 8: Deployment & Handoff

### 8.1 Pre-Deployment Checklist

Before deploying:

- [ ] All tests passing (unit + integration)
- [ ] CONTEXT.md up to date
- [ ] ADRs documented for all key decisions
- [ ] Issue tracker tickets complete and blocked-resolved
- [ ] No EBUSY/lock files remaining from previous runs
- [ ] Environment variables validated via `getEnv()` (per AGENTS.md invariant #4)
- [ ] Webhook secret validated on 100% of requests (invariant #5)
- [ ] Money events never fail silently (invariant #3)

### 8.2 Deployment Commands

```bash
# Typecheck/lint
npm run typecheck

# Run tests
npm test

# Set webhook (after local testing)
npm run set-webhook

# Deploy to Vercel
vercel prod
```

### 8.3 Post-Deployment Verification

- Check `/api/health` for deploy-lag diagnosis
- Verify admin notifications work
- Confirm Google Sheets rows appended correctly
- Test mockup generation flow (if applicable)
- Validate UPI QR generation and payment flow

### 8.4 Handoff (`/handoff`)

For handovers to other agents/team members:

```
/handoff
```

This compacts the current conversation into a handoff document so another agent can continue the work.

## Phase 9: Continuous Improvement

### 9.1 Retrospectives (`/retro`)

Run `/retro` after each major milestone or release to:

- Review what went well
- Identify improvements
- Action items for next cycle

### 9.2 Skill Updates

Pull updated skills when ready:

```bash
npx skills update
```

### 9.3 Documentation Maintenance

Keep `docs/` synchronized with code state:

- If code changes, update docs accordingly
- Delete obsolete documents
- Add new documents for new capabilities

## Summary: The Holistic Loop

```
┌─────────────────────────────────────┐
│  GRILL / RESEARCH                     │
│  → Requirements "in stone"            │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  PLAN / TICKETS (to-tickets)          │
│  → Tracer-bullet tickets              │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  IMPLEMENT + TDD                      │
│  → Red-green-refactor loop            │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  REVIEW + ARCHITECTURE                │
│  → Standards + Spec code review        │
│  → improve-codebase-architecture       │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  DEPLOY + VERIFY                      │
│  → Health check + tests               │
│  → handoff if needed                  │
└───────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  RETRO + CONTINUE                     │
│  → What went well + improvements      │
└─────────────────────────────────────┘
```

---

**Key Invariant**: This process is circular, not linear. After deployment, we retro and continue the loop. The skills provide the discipline; the project provides the context.