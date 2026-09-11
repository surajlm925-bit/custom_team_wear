# Developer & AI Assistant Cheatsheet (`docs/DEVELOPER_CHEATSHEET.md`)

This cheatsheet provides practical recipes for common development tasks, testing, and modifications.

---

## 1. Common Development Workflows

### 1.1 Running Tests
```bash
# Run all unit and integration tests (102+ tests)
npm test

# Run a specific test suite
node --import tsx --test tests/pricing.test.ts
node --import tsx --test tests/deterministicMockup.test.ts
node --import tsx --test tests/statusMachine.test.ts

# Typecheck without building (catches missing ESM .js extensions)
npm run typecheck
```

---

## 2. Code Modification Recipes

### 2.1 Recipe: Updating or Adding Garment Prices
All pricing logic lives in `src/pricing/`. **Never edit pricing anywhere else.**

1. Open [`src/pricing/priceBook.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/pricing/priceBook.ts).
2. Locate `TIER_RATES` and modify or add the garment rate per quantity tier:
   ```typescript
   export const TIER_RATES: Record<Tier, Record<ProductId, Record<QtyBracketKey, number>>> = {
     basic: {
       "basic-round-neck-dryfit": { "50_99": 359, "100_249": 319, "250_plus": 289 },
       // ...
     },
   };
   ```
3. If changing volume brackets, update `BRACKETS` in `src/pricing/priceBook.ts`.
4. Run `node --import tsx --test tests/pricing.test.ts` to verify contract tests.

---

### 2.2 Recipe: Adding a New Garment Logo Placement Zone
Placement zones for mockup compositing are configured in `src/mockup/zones.ts`.

1. Open [`src/mockup/zones.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/zones.ts).
2. Add the placement key to `LogoPlacement` in `src/pricing/priceBook.ts` if not already present:
   ```typescript
   export type LogoPlacement =
     | "left_chest"
     | "right_chest"
     | "center_chest"
     | "upper_back"
     | "full_back"
     | "left_sleeve"
     | "right_sleeve"
     | "custom_placement"; // new
   ```
3. In [`src/mockup/zones.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/zones.ts), define the bounding box for both silhouettes (`round_neck` and `polo`):
   ```typescript
   export const ZONES: Record<Silhouette, Record<LogoPlacement, PlacementZone>> = {
     polo: {
       // ...
       custom_placement: { x: 450, y: 520, width: 220, height: 180, view: "front" },
     },
   };
   ```
4. Update `LOGO_PLACEMENT_OPTIONS` in [`src/conversation/keyboards.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/keyboards.ts) so the button appears in Telegram.
5. Run `node --import tsx --test tests/deterministicMockup.test.ts`.

---

### 2.3 Recipe: Adding or Overriding a Catalog Garment
When new PDF catalogs are received or manual corrections are needed:

1. Place the new source PDF in `quality/<Tier>/`.
2. Run `npm run generate-catalog` to extract raster pages into `assets/catalog/`.
3. To override extracted metadata (e.g. GSM, name, brand label, style code), edit [`src/catalog/data/overrides.json`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/catalog/data/overrides.json).
4. Run `npm run generate-catalog` again to regenerate `catalog.generated.json`.
5. Run `node --import tsx --test tests/catalog.test.ts`.

---

### 2.4 Recipe: Updating the Google Sheets CRM Schema
If new order fields need to be logged into Google Sheets:

1. Open [`src/sheets/schema.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/schema.ts).
2. Add the new header name to `ORDER_HEADERS`.
3. Update `orderToRow(order)`:
   - Remember: Pass any string values through `sanitizeForSpreadsheet()`!
4. If adding new tabs, create a dedicated schema file (like `catalogSchema.ts` or `mockupSchema.ts`).
5. Run `node --import tsx --test tests/sanitize.test.ts`.

---

## 3. Webhook & Deployment Operations

### 3.1 Registering the Telegram Webhook
To point Telegram to your live Vercel function:
```bash
# On Windows PowerShell:
$env:TELEGRAM_BOT_TOKEN="<bot-token>"
$env:WEBHOOK_SECRET="<random-secret>"
npm run set-webhook -- https://your-deployment.vercel.app

# To verify Telegram's active webhook status:
npm run webhook-info

# To remove webhook (e.g. for maintenance):
npm run delete-webhook
```

### 3.2 Deploy-Lag Verification
Serverless deployments can sometimes run outdated builds if git commits lag:
```bash
curl https://your-deployment.vercel.app/api/health
```
Inspect the output:
- `commitSha`: Must match your latest git commit.
- `buildStamp`: Confirms active feature bundle.
- `features`: Lists boolean flags for catalog colour flow, advance calculation, and deterministic mockups.

---

## 4. Troubleshooting Common Gotchas

| Issue | Cause | Fix |
|---|---|---|
| `Cannot find module ... or its corresponding type declarations` | Missing `.js` extension in TypeScript ESM import | In ESM (`"type": "module"`), all relative imports **must** end with `.js` even for `.ts` files (e.g., `import x from "./y.js"`). |
| `TypeError: OrderStatus transition invalid` | Attempted invalid or backward status transition | Check `src/session/statusMachine.ts`. Statuses move forward only. |
| Telegram updates ignored or dropped | `lock:<chat_id>` mutex timeout or duplicate `update_id` | Webhook fast-ACK deduplicates by `upd:<update_id>`. Wait for concurrent message handling to finish. |
| Google Sheet row shows `#ERROR!` or formula warning | Raw user text contained leading `=`, `+`, `-`, or `@` | Pass text through `sanitizeForSpreadsheet()` in `src/shared/sanitize.ts`. |
| Mockup generation prompts for ₹20 | User has used 3 free mockups in current month | Check `mockup:quota:<chat_id>:<YYYY-MM>`. Quota resets at 00:00 IST on the 1st of each calendar month. |
