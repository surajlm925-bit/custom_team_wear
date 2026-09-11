import * as fs from "fs";
import * as path from "path";
import * as url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", ".env");
const envVars: Record<string, string> = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    const h = v.indexOf("#");
    if (h > 0 && !v.slice(0, h).includes("://")) v = v.slice(0, h).trim();
    if (/^[A-Z_][A-Z0-9_]*$/.test(k)) envVars[k] = v;
  }
}
const env = (k: string) => process.env[k] ?? envVars[k] ?? "";

const isLocal = process.argv.includes("--local");
const BASE = isLocal ? "http://localhost:3000" : "https://custom-teamwear-bot.vercel.app";
const SECRET = env("WEBHOOK_SECRET");
const REDIS = env("REDIS_REST_URL");
const REDIS_TOKEN = env("REDIS_REST_TOKEN");
const BLOB_TOKEN = env("BLOB_READ_WRITE_TOKEN");
// Optional: set LIVE_TEST_CHAT_ID to your real Telegram chat ID to test full conv flow.
// Messages WILL appear in that chat. Leave unset to skip conv flow tests.
const LIVE_CHAT_ID = env("LIVE_TEST_CHAT_ID") ? Number(env("LIVE_TEST_CHAT_ID")) : undefined;

let uid = Math.floor(Date.now() / 1000) * 1000; // timestamp-seeded — unique per run, beats 24h dedupe TTL
const nid = () => ++uid;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function textUpdate(text: string, chat: number) {
  return {
    update_id: nid(),
    message: {
      message_id: nid(),
      from: { id: chat, is_bot: false, first_name: "TestUser" },
      chat: { id: chat, type: "private", first_name: "TestUser" },
      date: Math.floor(Date.now() / 1000),
      text,
      entities: text.startsWith("/") ? [{ offset: 0, length: text.split(" ")[0].length, type: "bot_command" }] : undefined,
    },
  };
}

function cbUpdate(data: string, chat: number) {
  return {
    update_id: nid(),
    callback_query: {
      id: String(nid()),
      from: { id: chat, is_bot: false, first_name: "TestUser" },
      chat_instance: "test",
      message: { message_id: 1, chat: { id: chat, type: "private" }, date: Math.floor(Date.now() / 1000), text: "" },
      data,
    },
  };
}

async function webhook(update: object) {
  const r = await fetch(`${BASE}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
    body: JSON.stringify(update),
  });
  return r.status;
}

async function redisGet(key: string): Promise<string | null> {
  const r = await fetch(`${REDIS}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const j = await r.json() as { result?: string | null };
  return j.result ?? null;
}

async function redisDel(...keys: string[]) {
  for (const k of keys)
    await fetch(`${REDIS}/del/${encodeURIComponent(k)}`, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
}

let passed = 0, failed = 0, skipped = 0;
async function test(name: string, fn: () => Promise<void>, skip = false) {
  if (skip) { console.log(`  ${name} ... SKIP`); skipped++; return; }
  process.stdout.write(`  ${name} ... `);
  try { await fn(); console.log("PASS"); passed++; }
  catch (e: unknown) { console.log(`FAIL: ${e instanceof Error ? e.message : e}`); failed++; }
}
function ok(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log(`\nCTW Live Integration Tests — ${BASE}`);
if (LIVE_CHAT_ID) console.log(`Live conv tests using chat ID: ${LIVE_CHAT_ID}`);
else console.log(`Conv flow tests SKIPPED (set LIVE_TEST_CHAT_ID=<your_chat_id> to enable)`);
console.log();

// ---- Suite 1: Infrastructure ----
console.log("Suite 1: Infrastructure");
await test("GET /api/health → ok=true + buildStamp", async () => {
  const r = await fetch(`${BASE}/api/health`);
  ok(r.ok, `HTTP ${r.status}`);
  const j = await r.json() as { ok: boolean; buildStamp: string };
  ok(j.ok === true, `ok=${j.ok}`);
  process.stdout.write(`[${j.buildStamp}] `);
});
await test("Webhook rejects wrong secret with 401", async () => {
  const r = await fetch(`${BASE}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "wrong" },
    body: JSON.stringify(textUpdate("/start", 1234)),
  });
  ok(r.status === 401, `Expected 401 got ${r.status}`);
});
await test("Webhook returns 200 for valid update", async () => {
  const update = textUpdate("/start", 1);
  const s = await webhook(update);
  ok(s === 200, `Expected 200 got ${s}`);
  // Verify dedupe key was written
  await sleep(1000);
  const upd = await redisGet(`upd:${(update as any).update_id}`);
  ok(upd !== null, `Dedupe key upd:${(update as any).update_id} not found — update was not processed`);
});
await test("Webhook deduplicates repeated update_id (returns 200 OK duplicate)", async () => {
  const update = textUpdate("/start", 1);
  await webhook(update); // first delivery
  await sleep(500);
  const s2 = await webhook(update); // duplicate
  ok(s2 === 200, `Expected 200 got ${s2}`); // still 200, just skipped
});

// ---- Suite 2: Conversation flow (requires real LIVE_TEST_CHAT_ID) ----
const skipConv = !LIVE_CHAT_ID;
console.log("\nSuite 2: Conversation flow" + (skipConv ? " [SKIPPED — set LIVE_TEST_CHAT_ID]" : ""));

async function cleanupLive(chatId: number) {
  await redisDel(`sess:${chatId}`, `outer-sess:${chatId}`, `busy:${chatId}`, `conv:${chatId}`);
}

await test("/start → greeting + active conv in Redis", async () => {
  await cleanupLive(LIVE_CHAT_ID!);
  await webhook(textUpdate("/start", LIVE_CHAT_ID!));
  await sleep(5000);
  const v = await redisGet(`conv:${LIVE_CHAT_ID}`);
  ok(v !== null, `conv:${LIVE_CHAT_ID} missing — conversation not started`);
}, skipConv);

await test("order:bulk → draft.orderType=bulk", async () => {
  await webhook(cbUpdate("order:bulk", LIVE_CHAT_ID!));
  await sleep(5000);
  const raw = await redisGet(`sess:${LIVE_CHAT_ID}`);
  ok(raw !== null, `sess:${LIVE_CHAT_ID} missing`);
  const s = JSON.parse(raw) as { orderType?: string };
  ok(s.orderType === "bulk", `orderType=${s.orderType}`);
}, skipConv);

await test("garment:round_neck → draft.garmentSilhouette=round_neck", async () => {
  await webhook(cbUpdate("garment:round_neck", LIVE_CHAT_ID!));
  await sleep(5000);
  const raw = await redisGet(`sess:${LIVE_CHAT_ID}`);
  ok(raw !== null, `sess:${LIVE_CHAT_ID} missing`);
  const s = JSON.parse(raw) as { garmentSilhouette?: string };
  ok(s.garmentSilhouette === "round_neck", `garmentSilhouette=${s.garmentSilhouette}`);
}, skipConv);

await test("/start mid-flow → conv restarts (draft cleared, not reprompt)", async () => {
  const s = await webhook(textUpdate("/start", LIVE_CHAT_ID!));
  ok(s === 200, `Expected 200 got ${s}`);
  await sleep(5500);
  const raw = await redisGet(`sess:${LIVE_CHAT_ID}`);
  if (raw) {
    const sess = JSON.parse(raw) as { orderType?: string };
    ok(!sess.orderType, `/start did NOT restart — orderType still "${sess.orderType}" (genericReprompt bug)`);
  }
  const conv = await redisGet(`conv:${LIVE_CHAT_ID}`);
  ok(conv !== null, "No active conversation after /start restart");
}, skipConv);

await test("Cleanup live chat", async () => {
  await cleanupLive(LIVE_CHAT_ID!);
}, skipConv);

// ---- Suite 3: Blob storage ----
console.log("\nSuite 3: Blob storage");
await test("BLOB_READ_WRITE_TOKEN is set", async () => {
  ok(Boolean(BLOB_TOKEN), "BLOB_READ_WRITE_TOKEN empty — check .env or Vercel dashboard");
});
await test("Upload 1x1 test PNG → public URL returned", async () => {
  const { put } = await import("@vercel/blob");
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082", "hex");
  const r = await put(`test/ctw-live-test-${Date.now()}.png`, PNG, {
    access: "public", contentType: "image/png", token: BLOB_TOKEN, addRandomSuffix: false,
  });
  ok(r.url.startsWith("https://"), `Bad URL: ${r.url}`);
  process.stdout.write(`[${r.url.slice(0, 55)}...] `);
});

console.log(`\n${"─".repeat(50)}`);
console.log(`${passed}/${passed + failed + skipped} passed, ${skipped} skipped${failed ? `, ${failed} FAILED` : " ✓"}`);
if (!LIVE_CHAT_ID) {
  console.log("\nTip: To run full conversation flow tests:");
  console.log("  LIVE_TEST_CHAT_ID=<your_telegram_chat_id> node --import tsx scripts/live-test.ts");
}
process.exit(failed > 0 ? 1 : 0);


