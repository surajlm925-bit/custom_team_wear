# Conversation State Machine & Step Flows (`docs/STATE_MACHINE_AND_FLOWS.md`)

This guide details the conversational state machine, screen-by-screen steps (S00 to S12), status transitions, and draft order lifecycle.

---

## 1. Conversation Screen Flow (S00 to S12)

The customer flow is implemented in `src/conversation/orderFlow.ts` using `@grammyjs/conversations`:

```mermaid
flowchart TD
    S00["S00: Welcome / Start (/start)"] --> S01["S01: Quality Tier Selection<br/>(Basic / Standard / Premium Branded)"]
    S01 --> S02["S02: Style & Brand Selection<br/>(Catalog Items / Styles)"]
    S02 --> S03["S03: Garment Colour Selection<br/>(MANDATORY colour pick & confirmation)"]
    S03 --> S04["S04: Quantity Selection<br/>(MOQ Gate: 50 pcs)"]
    
    S04 -->|< 50 pcs| Reject["Polite Rejection Message<br/>(Zero logging, conversation ends)"]
    S04 -->|≥ 50 pcs| S05["S05: Size Split<br/>(Even Split / Standard Mix / Custom S-3XL)"]
    
    S05 --> S06["S06: Print Method<br/>(Screen / DTF / Sublimation / Embroidery / Help me pick)"]
    S06 --> S07["S07: Contact Details<br/>(City, Full Name, Phone Number)"]
    S07 --> S08["S08: Delivery Timeline<br/>(Standard 10-14d / Urgent <7d / Flexible)"]
    S08 --> S09["S09: Logo Upload & Placement<br/>(Upload photo + choose placement zone)"]
    
    S09 --> S10["S10: Order ID Creation & Mockup Proof<br/>(Sharp composite on exact garment; Quota check)"]
    S10 --> S11["S11: Itemized Quote Card & Dynamic UPI QR<br/>(Garment EXACT, Print ESTIMATE, 50% Advance Due)"]
    S11 --> S12["S12: Payment Proof Screenshot Upload<br/>(Customer uploads screenshot of UPI transfer)"]
    
    S12 --> AdminAlert["Admin Telegram Chat Alert<br/>(Contains customer details, quote, payment screenshot)"]
```

---

## 2. Detailed Screen Breakdown

### S00: Welcome & Entrypoint
- Triggered by `/start` or the first message.
- Explains bulk order parameters: **MOQ 50 pcs**, pan-India delivery, garment advance via UPI.
- Displays inline button: `"Build my teamwear quote"`.

### S01: Tier Selection
- Options:
  1. `Basic` — Economical (Cotton / Poly-cotton / Dry Fit)
  2. `Standard Polo` — Heavyweight 240+ GSM pique cotton / premium performance dry fit
  3. `Premium Branded` — Adidas, Reebok, Stellars, Van Heusen
- Back navigation returns to S00.

### S02: Brand & Style Selection
- Fetches available items from `src/catalog/index.ts`.
- Customer reviews photos from the catalog PDF page (`assets/catalog/`).
- Shows garment image with buttons to confirm style or view other styles in the tier.

### S03: Colour Selection (Mandatory Gate)
- Shows available colours for the chosen style code with preview swatches/photos where available.
- **Invariant**: The customer **cannot proceed** without choosing and confirming an exact colour.
- Stores `colorName`, `colorCode`, and `referenceImagePath` into the draft order.

### S04: Quantity Selection (MOQ Gate)
- Quick buttons: `50`, `60`, `100`, `150`, `250`, `500+` or `Enter custom quantity`.
- **Validation**:
  - `qty < 50`: Triggers funny/polite rejection copy (`copy.ts`), ends conversation without creating a lead.
  - `qty > 300`: Unlocks a `"Talk to a Human"` callback option.

### S05: Size Split Selection
- Pre-set ratios available:
  - **Even Split**: Distributes total evenly across S, M, L, XL, 2XL (remainder placed in L).
  - **Standard Mix**: Indian corporate bell curve (15% S, 30% M, 35% L, 15% XL, 5% 2XL).
  - **Enter my own**: Interactive text prompt parsing individual sizes (`S:10, M:20, L:30...`).
- Guarantees `sum(sizes) === qty`.

### S06: Print / Branding Method
- Buttons:
  - `Screen Printing` (ideal for bulk spot colors)
  - `DTF (Direct to Film)` (full color gradients & complex logos)
  - `Sublimation` (all-over print for dry fit)
  - `Embroidery` (premium stitched look)
  - `Not sure / Recommend for me` (defaults to DTF estimate)

### S07: Contact Details
- Collects:
  1. **City / Pin code** (validates length ≤ 40)
  2. **Customer Name** (validates length ≤ 60)
  3. **Phone Number** (accepts Indian mobile numbers, normalized to 10 digits or +91 format)

### S08: Delivery Timeline
- Buttons:
  - `Standard (10-14 days)`
  - `Urgent (< 7 days)` (flags `timelineUrgent: true` for priority handling)
  - `Flexible (15+ days)`

### S09: Logo Upload & Placement
- Customer sends an image/document of their logo.
- Bot prompts for placement zone:
  - `Left Chest`
  - `Center Chest`
  - `Upper Back`
  - `Full Back`
  - `Left Sleeve`
  - `Right Sleeve`
- Supports adding multiple logos or proceeding with one.

### S10: Order ID Assignment & Deterministic Mockup
- Order ID is generated atomically via Redis `INCR oid:YYMMDD` (e.g. `260910-0012`).
- Mockup Pipeline checks monthly quota (`mockup:quota:<chat_id>:<YYYY-MM>`):
  - **Free Mockup (Count ≤ 3)**: Generated instantly via Sharp using the confirmed garment photo from S03.
  - **Paid Mockup (Count ≥ 4)**: Requires ₹20 token deposit; transitions to awaiting payment and admin approval.
- Delivered to the customer in Telegram before demanding payment.

### S11: Itemized Quote Card & Dynamic UPI QR
- Displays the single-template Quote Card rendered by `renderQuoteCard()`:
  - Garment Total: **Exact** (calculated via `calculateQuote()`)
  - Branding Estimate: **Price Range** (e.g., ₹2,500 – ₹4,000)
  - Advance Due: **~50% of Garment Total** (via `Math.ceil`)
- Sends dynamic UPI QR image (`upi://pay?pa=...&pn=...&am=...&tn=Order-260910-0012`).

### S12: Payment Screenshot & Admin Dispatch
- Customer uploads a screenshot of the completed UPI transfer.
- Order record is created in Redis (`order:<order_id>`) and appended to Google Sheets (`Orders` tab).
- Instant notification with quick action buttons (`Confirm ✅`, `Payment Issue 🚩`) dispatched to all admin IDs in `ADMIN_CHAT_IDS`.

---

## 3. Order Status State Machine (`OrderStatus`)

Defined in `src/session/statusMachine.ts`. Transitions are strictly forward-only:

```mermaid
stateDiagram-v2
    [*] --> PendingPayment: Order submitted (S12)
    PendingPayment --> Confirmed: Admin verifies bank transfer
    PendingPayment --> PaymentIssue: Admin marks mismatch/uncredited
    PendingPayment --> LeadAbandoned: Customer abandons before proof

    PaymentIssue --> Confirmed: Customer re-submits valid proof
    PaymentIssue --> LeadAbandoned: No response after follow-up

    Confirmed --> [*]: Terminal state
    LeadAbandoned --> [*]: Terminal state
    LeadCallback --> [*]: High-value lead (>300 pcs callback)
```

### Transition Validation Rules
- **No Backward Transitions**: An order in `Confirmed` can never be reverted to `Pending Payment` or `Payment Issue`.
- **Terminal States**: `Confirmed` and `Lead — Abandoned` reject all future transitions.
- **Idempotency**: Attempting to transition to the exact same status is rejected as a no-op.

---

## 4. Mockup Generation State Machine (`MockupGenerationStatus`)

Defined in `src/shared/types.ts` and managed in `src/mockup/paidGeneration.ts`:

```mermaid
stateDiagram-v2
    [*] --> reserved: Quota checked

    state "Free Generation Path" as FreePath {
        reserved --> generating: Within monthly quota (≤3)
        generating --> completed: Sharp composite success
        generating --> failed: Internal processing error
    }

    state "Paid Generation Path (#4+)" as PaidPath {
        reserved --> awaiting_payment: Quota exhausted (>3)
        awaiting_payment --> awaiting_approval: Customer uploads ₹20 proof
        awaiting_approval --> approved: Admin clicks Approve
        awaiting_approval --> rejected: Admin clicks Reject
        approved --> generating
    }

    completed --> [*]
    rejected --> [*]
    failed --> [*]
```

---

## 5. Draft vs Session Lifecycle

- **`draft:<chat_id>`**:
  - Holds progressive fields as the customer taps buttons (`tier`, `productId`, `colorCode`, `qty`, `sizeSplit`).
  - Cleared upon successful submission into a permanent `order:<order_id>`.
  - Auto-expires after 24 hours of inactivity.
- **`sess:<chat_id>`**:
  - Internal grammY conversation state tracking which step handler is awaiting response.
  - Allows conversations to safely resume across serverless cold starts.
