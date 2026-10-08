# User Journey & Conversation Flow

This document outlines the step-by-step user journey for the Custom Teamwear Bulk Order Bot. The journey is designed as a click-first, linear conversational flow (currently on Telegram, designed to be portable to WhatsApp) that guides a user from catalog discovery to a paid, confirmed bulk order.

---

## 1. High-Level Flow Overview

The bot functions as a specialized funnel. The primary path is:
**Welcome → Product Selection → Configuration (Qty/Size/Print) → Contact Info → Mockup Generation → Quote → Payment → Confirmation**.

At any point, if a user abandons the flow post-quantity selection, they are logged as a "Lead" in the CRM for potential callback or follow-up.

---

## 2. Step-by-Step Order Flow (`orderFlow.ts`)

The conversation is divided into distinct, state-persisted steps. Progress is saved to a draft in Redis after every step, allowing users to resume if they get disconnected.

### Initialization
- **`/start` Command**: 
  - If a draft exists (has qty, < 24h old), the user is offered to **Resume** or start a **Fresh start**.
  - If no draft exists, begins at S00.

### S00: Tier Selection
- User selects their pricing tier / market segment (e.g., Corporate, College, Retail). This determines the available catalog groups and pricing brackets.

### S1: Catalog Selection
- **Group**: User picks a category (e.g., T-Shirts, Hoodies).
- **Item**: User selects a specific product model.
- **Image Confirmation**: User views the product image and clicks to confirm.
- **Color**: User selects the specific color variant.
- *(Note: This step is mandatory. If the user cannot find what they need or the brand is unscannable, the flow can end as "assisted" or go "back").*

### S2: Quantity (MOQ Hard Gate)
- User enters their desired total quantity.
- **MOQ Gate**: A minimum order quantity of 50 is strictly enforced. Below 50 results in a polite rejection (terminal state, no lead logged).
- **Upsell / Brackets**: The bot reveals pricing brackets and may offer an upsell if they are close to the next discount tier.

### S3: Size Split
- User defines how the total quantity is distributed across sizes. Options:
  1. **Even Split**: Distributed equally across standard sizes.
  2. **Standard Mix**: A typical bell-curve distribution.
  3. **Own Exact Sum**: User types out their specific size breakdown, which the bot validates to ensure it precisely matches the total quantity from S2.

### S4: Print Method
- User selects the preferred printing technique (e.g., Screen Print, Embroidery, DTF, Blank).

### S5 - S7: Customer Details
- User is prompted to type in their contact information:
  - **S5**: City / Delivery Location
  - **S6**: Full Name
  - **S7**: Phone Number (Validated)

### S8: Timeline
- User selects their expected delivery timeline (e.g., Standard, Urgent).

### S9: Multi-Logo Loop
- User is prompted to provide their custom artwork.
  - **Placement**: Where on the garment does it go? (e.g., Front Left Chest, Back Center).
  - **Upload**: User sends the logo file (photo or document).
  - **More Logos?**: Bot asks if they want to add another logo (loops until the user says they are done, up to a limit).

### S10: Order Assembly & Mockup Offer
- The system reserves a unique `Order ID`.
- The user is offered an optional **Garment Mockup**.
  - **Free Quota**: The user gets a limited number of free mockups per month (e.g., 3).
  - **Paid Quota**: If the quota is exceeded, the user is prompted to pay a small nominal fee (e.g., ₹20) to generate the mockup. This requires admin approval of the payment screenshot.
- *The mockup generation triggers asynchronously in the background. The user can proceed while it generates.*

### S11: Quote & Payment
- **Quote Card**: The bot presents a highly polished, detailed summary of the order configuration, unit price, print estimates, and the **Grand Total**.
- **Advance Request**: A 50% advance payment is required.
- **Payment Screen**: 
  - A dynamic UPI QR code is generated for the exact advance amount.
  - A static fallback QR code is also provided.
- **Proof of Payment**: User uploads a screenshot of their successful payment transaction.

---

## 3. Post-Submission & Admin Verification

Once the user submits the payment screenshot:
1. **CRM Update**: The order is fully appended to the Google Sheets CRM (`Orders` and `Catalog Selections` tabs).
2. **Admin Notification**: An Admin Card is sent to the designated Admin Telegram group containing the order details, mockup (if generated), and the payment screenshot.
3. **Manual Verification**:
   - Admin clicks **✅ Confirm**: The order transitions to `Confirmed`. The user is notified that production will begin.
   - Admin clicks **🚩 Issue**: The order transitions to `Payment Issue`. The user is notified to contact support.

---

## 4. Exit Taxonomy & Lead Generation

The bot utilizes a smart lead capture system for users who abandon the flow or intentionally cancel:
- **Pre-Qty Cancels**: Discarded silently. No CRM row is created.
- **Post-Qty Cancels**: If the user drops off *after* entering a quantity (≥ 50), a row is written to the sheet as **"Lead — Abandoned"**.
- **High-Value Callbacks**: If a user enters a quantity > 300 and opts out, the bot prompts a "📞 Call Me" button, logging them as **"Lead — High-Value Callback"**.
- **No Payment**: If the user reaches the quote but doesn't upload a payment screenshot, they are logged as **"Lead — No Payment"**.
