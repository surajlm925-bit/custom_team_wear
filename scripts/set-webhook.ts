/**
 * One-time (or per-deploy) helper: registers the Telegram webhook with
 * the secret_token. Run with: npm run set-webhook -- https://your-app.vercel.app
 * Requires TELEGRAM_BOT_TOKEN and WEBHOOK_SECRET in the environment
 * (e.g. via `vercel env pull .env.local` then loading it, or export manually).
 */

export {};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;
const baseUrl = process.argv[2];

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment.");
  process.exit(1);
}
if (!secret) {
  console.error("Missing WEBHOOK_SECRET in environment.");
  process.exit(1);
}
if (!baseUrl) {
  console.error("Usage: npm run set-webhook -- https://your-app.vercel.app");
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/webhook`;

const apiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
const params = new URLSearchParams({
  url: webhookUrl,
  secret_token: secret,
});

const response = await fetch(`${apiUrl}?${params.toString()}`, { method: "POST" });
const body = (await response.json()) as { ok: boolean };
console.log(JSON.stringify(body, null, 2));

if (!body.ok) {
  process.exit(1);
}
console.log(`\nWebhook set to: ${webhookUrl}`);
