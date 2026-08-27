/**
 * Removes the currently registered Telegram webhook.
 * Useful when switching between local testing and Vercel, or before
 * decommissioning a bot token. Run with: npm run delete-webhook
 */

export {};

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment.");
  process.exit(1);
}

const apiUrl = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
const response = await fetch(apiUrl, { method: "POST" });
const body = (await response.json()) as { ok: boolean };
console.log(JSON.stringify(body, null, 2));

if (!body.ok) {
  process.exit(1);
}
console.log("\nWebhook deleted.");
