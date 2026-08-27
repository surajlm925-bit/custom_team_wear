# Project Plan — Custom Team Wear WhatsApp Order Bot

Companion to `PRD-CTW-WhatsApp-Bot.md`. This is the build-it document: architecture, task breakdown, schema, and setup order.

---

## 1. Architecture

```
WhatsApp Cloud API (Meta)
        │  webhook (POST /webhook)
        ▼
Node.js/Next.js API route (Vercel)
        │
        ├─► Conversation State Engine (reads/writes Supabase)
        │        │
        │        ├─► Category classifier + reply generator (OpenAI API)
        │        ├─► MOQ / pricing lookup (Supabase config tables)
        │        └─► Escalation rule engine
        │
        ├─► Supabase (Postgres) — leads, messages, config tables
        ├─► Google Sheets API — mirrors lead record into existing CRM sheet
        └─► Notification (WhatsApp group msg / Slack webhook / email via Resend) — on escalation
```

**Why this shape:**
- Next.js on Vercel = one deploy target for both the webhook and (later) an admin UI, matches the client's own proposed stack.
- Supabase = source of truth; Google Sheet is a *mirror* (one-way push) so the sales team keeps using a tool they already know, without you building CRM UI in Phase 1.
- Conversation logic is a **state machine that calls the LLM for language understanding and phrasing, not one that lets the LLM freely decide what to ask**. This keeps MOQ/pricing/escalation deterministic and testable — critical for FR11 and the "never invent a price" requirement.

---

## 2. Tech Stack (confirmed choices)

| Layer | Choice | Why |
|---|---|---|
| Hosting / API | Next.js API routes on Vercel | Matches client's proposed stack, generous free tier, trivial deploy |
| Database | Supabase (Postgres) | Matches client's proposed stack, free tier is enough for MVP volume |
| WhatsApp | WhatsApp Cloud API (direct Meta) | No vendor lock-in, no monthly SaaS fee, full control over logic — you already have the number ready |
| LLM | OpenAI API (GPT model, function-calling / structured output) | Matches client's proposed stack; used only for classification + natural reply phrasing within fixed rules |
| CRM mirror | Google Sheets API | Zero learning curve for the client's existing team |
| Notifications | Start with WhatsApp group message via the same Cloud API, or Slack webhook if they prefer | Confirm with client (open item in PRD) |
| Payments (Phase 2) | Razorpay | Client's proposed choice |

---

## 3. Data Model (Supabase)

```sql
-- Leads / conversations
create table leads (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null unique,
  customer_name text,
  stage text not null default 'NEW LEAD',       -- pipeline stage label
  tags text[] default '{}',                      -- context tags array
  product_category text,
  quantity int,
  gender_fit text,                                -- Men/Women/Unisex
  colour text,
  needs_printing boolean,
  print_type text,
  has_logo boolean,
  logo_url text,
  delivery_location text,
  delivery_date date,
  is_urgent boolean default false,
  budget text,
  quoted_range text,
  escalated boolean default false,
  escalation_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Full message log per lead (for context + debugging + audit)
create table messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  direction text not null,       -- 'inbound' | 'outbound'
  content text,
  media_url text,
  wa_message_id text,            -- for webhook idempotency
  created_at timestamptz default now()
);

-- Config: category MOQ (client-editable without a deploy)
create table category_moq (
  category text primary key,
  moq int not null
);

-- Config: pricing ranges by category/tier/qty-break
create table pricing_config (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  tier text not null,             -- basic | standard | branded
  qty_break text not null,        -- '50+' | '100+'
  price_min numeric,
  price_max numeric
);

-- Config: printing cost ranges
create table printing_config (
  method text primary key,        -- screen_print | dtf | sublimation | embroidery
  price_min numeric,
  price_max numeric
);

-- Config: escalation rules (keep simple keyword/threshold rules editable)
create table escalation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text,                 -- 'qty_threshold' | 'keyword' | 'urgent_delivery'
  rule_value text,
  reason_label text
);
```

Seed `category_moq`, `pricing_config`, and `printing_config` directly from the PRD §5.1/5.2 tables before go-live.

---

## 4. Phased Task Breakdown

### Phase 0 — Setup (½–1 day)
- [ ] Confirm the WhatsApp Business number + Meta app permissions (message templates, webhook subscription)
- [ ] Create Supabase project, run schema above
- [ ] Create Vercel project, connect repo
- [ ] Get OpenAI API key
- [ ] Set up Google Sheets API service account + share target sheet
- [ ] Decide + set up the escalation notification channel

### Phase 1 — Core webhook + state machine (3–5 days)
- [ ] Webhook endpoint: verify Meta's challenge on GET, receive messages on POST
- [ ] Idempotency: dedupe on `wa_message_id`
- [ ] Create/fetch `leads` row per phone number on first message
- [ ] Store every inbound/outbound message in `messages`
- [ ] Send opening message on first-ever contact
- [ ] Build the field-collection state machine (§7.2 of PRD) — track which fields are filled, ask for the next missing one
- [ ] Wire OpenAI call for: (a) classifying free text into a category, (b) extracting structured fields from a casual reply (e.g. "need about 60 navy polos for our sales team"), (c) phrasing the next question in the founder's tone
- [ ] Constrain the LLM: it should never generate a price or delivery promise itself — those are always pulled from config tables and inserted into the reply, not invented

### Phase 2 — Business rules (2–3 days)
- [ ] MOQ check against `category_moq`, soft-redirect flow for sub-MOQ leads
- [ ] Pricing range lookup against `pricing_config` + `printing_config`, matched to quantity tier
- [ ] Escalation rule engine checked every turn, not just at the end
- [ ] Escalation handoff message to customer + structured notification to human channel with full lead context

### Phase 3 — CRM sync + tagging (1–2 days)
- [ ] Stage label transitions (NEW LEAD → HOT LEAD → QUOTATION SENT → FOLLOW UP TODAY, etc.) driven by conversation events
- [ ] Context tag assignment (Corporate/College/Event/Sports/etc., Urgent, Payment Pending, Bangalore, product-type tags)
- [ ] One-way sync: on every lead update, push/update the corresponding row in the existing Google Sheet CRM (match existing columns: customer, company, product, quantity, order value, delivery date, payment status, feedback, repeat order)

### Phase 4 — Media handling (1 day)
- [ ] Accept image messages (logo uploads) from WhatsApp, download via Cloud API media endpoint, store in Supabase storage, link to lead record

### Phase 5 — Testing & hardening (2–3 days)
- [ ] Script through ~15 realistic conversations covering: normal happy path per category, sub-MOQ lead, urgent delivery, GST invoice request, complaint keywords, ambiguous product description, no-logo customer, budget refusal, qty > 500
- [ ] Load-test webhook idempotency (simulate Meta's retry behavior)
- [ ] Confirm every escalation trigger actually fires (this is the highest-risk area — false negatives here cost real leads/trust)
- [ ] Founder review pass on actual bot phrasing/tone before going live

### Phase 6 — Launch (½ day)
- [ ] Point the live WhatsApp number's webhook at production
- [ ] Soft-launch: monitor first 1–2 days of real conversations closely, be ready to patch state-machine edge cases
- [ ] Hand off CRM sheet + a short doc to the client's sales team explaining the labels/tags they'll now see

**Total estimate: ~10–15 working days** for Phase 1 MVP as scoped in the PRD, assuming no major surprises in Meta's business verification process (that step is outside your control and can itself take days if not already approved — confirm current approval status, not just number existence).

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Meta WhatsApp Business verification delays | Confirm current approval status on day 0, not day 10 |
| LLM misclassifies product category or invents a price | Hard-constrain: LLM only extracts/phrases, all numbers come from DB lookups; add confidence threshold with fallback clarifying question |
| Escalation rule misses a case | Treat escalation test coverage as the highest-priority test suite, not an afterthought |
| Client's two MOQ documents conflict | Resolve before go-live (flagged in PRD open items) — don't guess |
| WhatsApp's 24-hour session window / template message rules | Research Meta's messaging window policy before Phase 6 — outbound follow-ups (Day 2/3/5 in the spec) outside 24h require pre-approved message templates, not free-form text |
| Conversation state getting stuck/looping | Every state has a max-retry count that force-escalates instead of looping forever |

---

## 6. What's Deliberately Deferred to Phase 2

- AI mockup generation (OpenAI image API) + customer approval flow
- Razorpay advance payment link generation + payment confirmation webhook
- Automated production-status and dispatch tracking pushes
- Multi-language support (build config-driven, don't hardcode English, but only ship English now)
- Custom admin dashboard (replace the Google Sheet mirror once Phase 1 is validated)
