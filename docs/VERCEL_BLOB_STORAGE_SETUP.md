# Vercel Blob Storage Setup Guide — Image & Mockup Persistence

This guide explains how to enable **Vercel Blob** storage for `custom-teamwear-bot` so generated mockup images are durably saved with permanent public URLs, linked in Google Sheets, and accessible to customers and admins.

---

## Why Vercel Blob is Used

1. **Permanent Proofs**: Telegram `file_id`s expire and can only be accessed using your Telegram Bot Token. Vercel Blob gives each generated mockup image a stable, permanent public HTTPS link (e.g. `https://<store-id>.public.blob.vercel-storage.com/...`).
2. **Google Sheets Sync**: The durable image URL is recorded in the `MockupGenerations` sheet tab and `OrderData` snapshot so admins can click and verify artwork proofs directly from the spreadsheet.
3. **Zero Maintenance**: Vercel automatically manages SSL, CDN caching, and token rotation.

---

## Setup Instructions (2 Minutes)

### Method 1: Via Vercel Dashboard (Recommended)

1. **Log in to Vercel**:
   Go to [https://vercel.com/dashboard](https://vercel.com/dashboard).

2. **Open Your Project**:
   Select your team/account (`one-touch-ai`) and click on **`custom-teamwear-bot`**.

3. **Navigate to Storage**:
   In the project top navigation bar, click on the **Storage** tab.

4. **Create a Blob Store**:
   - Click the **Create** button (or **Connect Database** / **Create Database**).
   - In the modal that appears, select **Blob** (Serverless Object Storage).
   - Click **Continue**.

5. **Configure & Connect**:
   - **Store Name**: Enter a name, e.g. `ctw-mockups` or `custom-teamwear-storage`.
   - **Read Access**: Leave as **Public** (required so mockup URLs can be rendered in Telegram and clicked from Google Sheets).
   - Click **Create & Continue**.

6. **Select Environments**:
   - Under **Connect to Project**, ensure all three environments are checked:
     - [x] **Production**
     - [x] **Preview**
     - [x] **Development**
   - Click **Connect**.

7. **Automatic Configuration**:
   - Vercel will automatically create and inject the secret environment variable:
     ```env
     BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
     ```
   - You do **not** need to copy or paste this token manually—Vercel attaches it directly to your project settings.

8. **Redeploy to Activate**:
   - Environment variables take effect on deployments created after the variable is added.
   - Run a production deployment from your terminal:
     ```bash
     vercel --prod
     ```
     *(Or push a commit to trigger a GitHub deployment).*

---

### Method 2: Via Vercel CLI (Alternative)

If you prefer using the terminal with Vercel CLI installed:

```bash
# Link to your Vercel project if not already linked
vercel link

# Pull the latest environment variables (including BLOB_READ_WRITE_TOKEN once created)
vercel env pull .env.local
```

---

## How to Verify It's Working

1. **Check Environment Variables**:
   - In Vercel Project Settings → **Environment Variables**, verify that `BLOB_READ_WRITE_TOKEN` is present and assigned to **Production**.

2. **Test via Telegram Bot**:
   - Start a **Bulk Order** in Telegram (`/start` → `📦 Bulk Order`).
   - Progress through: Style → Quantity (50+) → Delivery details → Quality → Sub-quality & Color.
   - Select Branding (`🖨️ Printing`), choose a placement (e.g. `Left Chest`), and upload a sample logo image.
   - Tap **🎨 Yes, preview mockup**.
   - The bot will generate the front/back composite and upload it to Vercel Blob.

3. **Check Blob Storage Dashboard**:
   - Go to your Vercel project → **Storage** tab → click your Blob store.
   - You will see the uploaded mockup files organized under:
     ```
     mockups/CTW-YYMMDD-XX/front.png
     mockups/CTW-YYMMDD-XX/back.png
     ```
   - Clicking on any file will display the permanent URL and image preview.

4. **Check Google Sheets**:
   - Open your connected Google Sheet → navigate to the **MockupGenerations** tab.
   - You will see the row for that generation with the durable Vercel Blob URLs populated in the output columns.
