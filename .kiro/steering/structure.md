# Project Structure

## Current state
The repo currently contains only planning documents — no source code yet:

```
custom team wear/
├── .kiro/
│   └── steering/          # AI assistant steering docs (this file, product.md, tech.md)
└── docs/
    ├── PRD-CTW-WhatsApp-Bot.md            # authoritative v1.0 spec (Telegram bot)
    └── Project-Plan-CTW-WhatsApp-Bot.md   # superseded architecture doc
```

## Expected structure once implementation starts
Based on the approved architecture (grammY + Vercel + Upstash Redis + Google Sheets), a natural layout follows the "one channel-agnostic core, one adapter per channel" principle from the PRD:

```
├── api/                    # Vercel serverless function(s) — webhook entry point
│   └── webhook.ts          # Telegram webhook handler (fast-ACK, dedupe, secret_token check)
├── src/
│   ├── adapters/           # Channel adapters implementing the fixed interface
│   │   └── telegram.ts     # verifyRequest · sendMessage · sendMenu · sendImage · fetchMedia · onUpdate
│   ├── conversation/       # grammY conversation/menu definitions per PRD §5 flow (S00–S11)
│   ├── pricing/            # Pure functions over the PRD §6 price book — single source of pricing truth
│   ├── session/            # Redis session read/write, state machine, status enum transitions
│   ├── sheets/             # Google Sheets CRM writer (Orders tab)
│   ├── qr/                 # UPI QR generation (`upi://pay` encoding)
│   ├── admin/              # Admin card rendering + Confirm/Issue handlers
│   └── shared/             # Shared quote/admin card renderer, sanitizers, types
├── tests/                  # Conversation suite / contract tests (must pass for any new channel adapter)
├── docs/                   # PRD + project plan (existing)
└── .kiro/steering/         # AI assistant steering docs
```

## Organization principles
- **Adapter isolation**: nothing outside `src/adapters/` may reference Telegram-specific types or APIs directly. This is what keeps a future WhatsApp adapter a drop-in addition.
- **Pricing is centralized**: `src/pricing/` is the only place a rupee amount may be computed. No component outside it may hardcode or derive a price.
- **Shared rendering**: the quote card (customer) and admin card must be produced by the same renderer in `src/shared/` to guarantee they can never disagree.
- **State machine over ad hoc flags**: conversation progress lives in Redis session state (`sess:<chat_id>`) and moves through the fixed status enum (PRD §8.1) — avoid scattering conversation logic across handlers.
- **Config-driven pricing**: price book and print-method ranges (PRD §6) should live in a single config module/file, not inline in conversation code, so it's easy to update as pricing changes.
- **Contract tests**: any new channel adapter (e.g. future WhatsApp) must pass the same conversation test suite as the Telegram adapter before merging.

## Documentation
- Keep `docs/PRD-CTW-WhatsApp-Bot.md` as the single authoritative spec. If requirements change, update it directly rather than letting code and doc drift.
- `docs/Project-Plan-CTW-WhatsApp-Bot.md` is historical/superseded — do not extend it; if the project plan needs updating, create a new plan aligned with the PRD's Telegram/grammY architecture.
