# System Architecture (`docs/ARCHITECTURE.md`)

This document provides a technical deep-dive into the Custom Teamwear Bot architecture, component interactions, security model, and data storage design.

---

## 1. High-Level Component Architecture

The system operates as a serverless, event-driven pipeline on Vercel, interfacing with Telegram, Upstash Redis, Google Sheets CRM, and Vercel Blob storage:

```mermaid
flowchart TD
    subgraph Clients["External Actors"]
        Customer["Customer (Telegram Chat)"]
        Admin["Admin (Telegram Chat)"]
    end

    subgraph Vercel["Vercel Serverless Platform"]
        Webhook["/api/webhook.ts<br/>(Secret Check, Dedupe & Chat Lock)"]
        BotEngine["grammY Bot Pipeline<br/>(src/bot/index.ts)"]
        ConvFlow["Conversation Engine<br/>(src/conversation/orderFlow.ts)"]
        PricingEngine["Pricing Engine<br/>(src/pricing/index.ts)"]
        MockupPipeline["Mockup Pipeline<br/>(src/mockup/workflow.ts)"]
        MockupPromptBuilder["Mockup Prompt Builder<br/>(src/mockup/promptBuilder.ts)"]
        AdminActions["Admin Callbacks<br/>(src/admin/actions.ts)"]
    end

    subgraph DataStores["Storage & External Services"]
        Redis[("Upstash Redis<br/>Sessions, Drafts, Locks, Quotas")]
        Sheets[("Google Sheets CRM<br/>Orders, Catalogs, Mockups")]
        VercelBlob[("Vercel Blob<br/>Durable Mockup Images")]
        TelegramAPI["Telegram Bot API<br/>(Send Photos, Messages, Menus)"]
        Sentry["Sentry<br/>Error Telemetry"]
    end

    Customer -->|Interactions / Photos| Webhook
    Admin -->|Confirm / Issue Callbacks| Webhook
    Webhook --> BotEngine
    BotEngine --> ConvFlow
    BotEngine --> AdminActions

    ConvFlow -->|Price Quote Request| PricingEngine
    ConvFlow -->|Garment Mockup Request| MockupPipeline
    ConvFlow -->|Prompt Request| MockupPromptBuilder
    ConvFlow <-->|Read / Write State| Redis

    MockupPipeline -->|Sharp Composite| VercelBlob
    MockupPipeline -->|Quota / Tracking| Redis
    MockupPipeline -->|Send Photo| TelegramAPI

    AdminActions -->|Update Status| Redis
    AdminActions -->|Log Record| Sheets
    AdminActions -->|Notify Customer| TelegramAPI

    ConvFlow -->|Append Order / Leads| Sheets
    BotEngine -.->|Errors| Sentry
```

---

## 2. Webhook Request Lifecycle

Telegram posts updates to `/api/webhook.ts`. The handler guarantees fast response times, idempotent execution, and serialized per-chat processing:

```mermaid
sequenceDiagram
    autonumber
    participant TG as Telegram Servers
    participant WH as /api/webhook.ts
    participant Lock as Redis Chat Lock
    participant Dedupe as Redis Dedupe Key
    participant Bot as grammY Bot Pipeline

    TG->>WH: POST update with X-Telegram-Bot-Api-Secret-Token
    WH->>WH: Validate secret token (reject 401 if invalid)
    WH->>Dedupe: Check & set `upd:<update_id>` (TTL 24h)
    alt Update already seen
        WH-->>TG: HTTP 200 OK (Skip duplicate)
    else New update
        WH->>Lock: Acquire `lock:<chat_id>`
        alt Lock busy
            WH-->>TG: HTTP 200 OK (Drop concurrent update to preserve sequence)
        else Lock acquired
            WH->>Bot: bot.handleUpdate(update)
            Bot-->>WH: Complete processing
            WH->>Lock: Release `lock:<chat_id>`
            WH-->>TG: HTTP 200 OK
        end
    end
```

---

## 3. Storage Architecture & Schemas

### 3.1 Upstash Redis Topologies
Redis holds transient and semi-persistent conversational state using standard namespaces:

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `upd:<update_id>` | string | 24 hours | Deduplication marker for incoming webhook updates |
| `lock:<chat_id>` | string | 15 seconds | Distributed mutex preventing race conditions for same user |
| `sess:<chat_id>` | string (JSON) | 24 hours | Active grammY conversation session state and checkpoint |
| `draft:<chat_id>` | string (JSON) | 24 hours | Transient order builder storing choices before final submission |
| `order:<order_id>` | string (JSON) | Persistent | Immutable snapshot of confirmed/submitted order |
| `oid:YYMMDD` | integer | 48 hours | Daily atomic counter (`INCR`) generating order IDs (`YYMMDD-XXXX`) |
| `mockup:quota:<chat_id>:<YYYY-MM>`| integer | 35 days | Mockup counter per chat for the Kolkata calendar month |
| `mockup:gen:<generation_id>` | string (JSON) | Persistent | State record of a mockup generation request |

---

### 3.2 Google Sheets CRM Schemas

All writes pass through `src/sheets/safeAppend.ts` with sanitization to prevent CSV/formula injection:

#### Tab 1: `Orders`
Persistent ledger for all orders and abandoned/disqualified leads.
- **Columns**: `Timestamp`, `Order ID`, `Status`, `Customer Name`, `Phone`, `City`, `Tier`, `Product`, `Confirmed Catalog Style`, `Qty`, `Size Split`, `Print Method`, `Timeline`, `Garment Total (₹)`, `Print Est Low (₹)`, `Print Est High (₹)`, `Grand Total Low (₹)`, `Grand Total High (₹)`, `Advance Due (₹)`, `Chat ID`, `Admin Notes`.

#### Tab 2: `Catalog Selections`
Traceability for exact catalog styles picked by customers:
- **Columns**: `Timestamp`, `Order ID`, `Catalog Version`, `Tier`, `Group ID`, `Group Label`, `Item ID`, `Item Label`, `Product ID`, `Garment Type`, `Source PDF ID`, `Source Page`, `Style Code`, `Color Name`, `Color Code`, `Reference Image Path`, `Reference Kind`.

#### Tab 3: `Mockup Generations`
Tracks all mockup requests, quotas, and admin payment approvals:
- **Columns**: `Timestamp`, `Generation ID`, `Order ID`, `Customer Chat ID`, `Status`, `Free / Paid`, `Amount (₹)`, `Month Key`, `Style Picked`, `Reference Image`, `Requested Views`, `Logos Rendered`, `Output URLs`, `Payment Proof File ID`, `Approved By Admin ID`, `Completed At`, `Failure Reason`.

---

## 4. Security & Safety Model

1. **Telegram Secret Token Check**:
   - Registered using `setWebhook` with `secret_token = WEBHOOK_SECRET`.
   - Every incoming request to `/api/webhook.ts` is checked:
     `req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET`. Mismatches receive an immediate `401 Unauthorized`.
2. **Formula Injection Shield**:
   - `sanitizeForSpreadsheet()` strips `= + - @` from the start of every text string before writing to Google Sheets.
3. **Server-Side Authority for Money & Status**:
   - Clients never send prices or status values. All pricing is computed via pure functions in `src/pricing/`.
   - Order transitions are validated against `src/session/statusMachine.ts`.
4. **Admin Route Authorization**:
   - Admin operations (confirming payments, approving paid mockups) check `ADMIN_CHAT_IDS.includes(ctx.from.id)`. Any unauthorized attempt is rejected and logged.
5. **Fail-Safe Admin Escalation**:
   - If Google Sheets API fails or encounters quota limits, the system catches the error and sends the full unformatted order data directly to the admin Telegram chat so no lead is lost.
