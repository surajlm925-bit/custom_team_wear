/**
 * Prints the Telegram webhook currently registered for the bot token in
 * the environment — the authoritative answer to "which URL is Telegram
 * actually calling?" (Phase 1 diagnosis).
 *
 * Run with the PRODUCTION bot token loaded:
 *   vercel env pull .env.prod --environment=production
 *   # then load it into the shell, or:
 *   node --env-file=.env.local --import tsx scripts/webhook-info.ts
 *
 * Outputs Telegram's getWebhookInfo verbatim: url, pending_update_count,
 * last_error_date/message, ip_address, etc.
 */

export {};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
const body = await response.json();
console.log(JSON.stringify(body, null, 2));
