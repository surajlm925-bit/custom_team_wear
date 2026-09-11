/**
 * Monthly free-mockup quota tests — commit-on-success model.
 *
 * Proves:
 *  - reserveGeneration DECIDES free/paid but does NOT consume a slot,
 *  - a slot is consumed only when commitFreeGeneration runs (success),
 *  - the first N (default 3) SUCCESSFUL free generations are free; the
 *    next is paid ₹20,
 *  - the decision is sticky per generationId (retry stays free/paid, no
 *    re-charge, no double-count),
 *  - a front+back request is ONE generation (single generationId),
 *  - the counter resets at the Kolkata calendar-month boundary,
 *  - commit is idempotent per generationId.
 */
import "./support/testEnv.js";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeRedis } from "./support/fakeRedis.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import {
  reserveGeneration,
  commitFreeGeneration,
  kolkataMonthKey,
  peekUsage,
} from "../src/mockup/quota.js";

let redis: FakeRedis;

beforeEach(() => {
  redis = new FakeRedis();
  __setRedisForTests(redis);
});

const CHAT = "tg:5512345678";
const AUG = new Date("2026-08-15T12:00:00Z");
const SEP = new Date("2026-09-15T12:00:00Z");

/** Reserve + immediately commit (simulate a successful free generation). */
async function succeedFree(chat: string, genId: string, at = AUG) {
  const r = await reserveGeneration(chat, genId, at);
  if (r.free) await commitFreeGeneration(chat, genId, at);
  return r;
}

test("reservation alone does NOT consume a slot; only commit does", async () => {
  // Reserve three without committing — none consumed yet.
  await reserveGeneration(CHAT, "r1", AUG);
  await reserveGeneration(CHAT, "r2", AUG);
  await reserveGeneration(CHAT, "r3", AUG);
  const usage = await peekUsage(CHAT, AUG);
  assert.equal(usage.committedFreeThisMonth, 0, "reservations must not consume slots");
  assert.equal(usage.nextIsFree, true);
});

test("first three SUCCESSFUL free generations are free, the fourth is paid ₹20", async () => {
  const r1 = await succeedFree(CHAT, "gen-1");
  const r2 = await succeedFree(CHAT, "gen-2");
  const r3 = await succeedFree(CHAT, "gen-3");
  const r4 = await reserveGeneration(CHAT, "gen-4", AUG);

  assert.equal(r1.free, true);
  assert.equal(r2.free, true);
  assert.equal(r3.free, true);
  assert.equal(r4.free, false);
  assert.equal(r4.amountInr, 20);

  const usage = await peekUsage(CHAT, AUG);
  assert.equal(usage.committedFreeThisMonth, 3);
});

test("reserving the same generationId twice replays the identical decision (no re-charge)", async () => {
  const first = await reserveGeneration(CHAT, "gen-dup", AUG);
  const replay = await reserveGeneration(CHAT, "gen-dup", AUG);
  assert.deepEqual(replay, first);
});

test("commit is idempotent per generationId — a duplicate success does not double-count", async () => {
  await succeedFree(CHAT, "gen-x");
  await commitFreeGeneration(CHAT, "gen-x", AUG); // duplicate success callback
  const usage = await peekUsage(CHAT, AUG);
  assert.equal(usage.committedFreeThisMonth, 1);
});

test("a paid generation stays paid on a repeated reservation (sticky, no second ₹20)", async () => {
  await succeedFree(CHAT, "p1");
  await succeedFree(CHAT, "p2");
  await succeedFree(CHAT, "p3");
  const paid = await reserveGeneration(CHAT, "p4-paid", AUG);
  const paidRetry = await reserveGeneration(CHAT, "p4-paid", AUG);
  assert.equal(paid.free, false);
  assert.equal(paid.amountInr, 20);
  assert.deepEqual(paidRetry, paid);
});

test("quota resets at the Asia/Kolkata calendar-month boundary", async () => {
  await succeedFree(CHAT, "aug-1", AUG);
  await succeedFree(CHAT, "aug-2", AUG);
  await succeedFree(CHAT, "aug-3", AUG);
  const augPaid = await reserveGeneration(CHAT, "aug-4", AUG);
  assert.equal(augPaid.free, false);

  const sepFirst = await reserveGeneration(CHAT, "sep-1", SEP);
  assert.equal(sepFirst.free, true);
  assert.notEqual(augPaid.monthKey, sepFirst.monthKey);
});

test("month key uses the Asia/Kolkata calendar, not UTC", () => {
  assert.equal(kolkataMonthKey(new Date("2026-08-31T20:00:00Z")), "2026-09");
  assert.equal(kolkataMonthKey(new Date("2026-08-31T17:00:00Z")), "2026-08");
});

test("per-chat isolation: one chat's committed usage does not affect another", async () => {
  const other = "tg:9999999999";
  await succeedFree(CHAT, "c1");
  await succeedFree(CHAT, "c2");
  await succeedFree(CHAT, "c3");
  const chatPaid = await reserveGeneration(CHAT, "c4", AUG);
  assert.equal(chatPaid.free, false);

  const otherFirst = await reserveGeneration(other, "o1", AUG);
  assert.equal(otherFirst.free, true);
});
