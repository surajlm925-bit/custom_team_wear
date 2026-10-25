/**
 * Per-chat flood control — PRD §5.3, §10.1 (~20 msg/min).
 * Uses an in-memory sliding window for instantaneous 0ms validation.
 */

const chatRateLimits = new Map<string, number[]>();
const WINDOW_MS = 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/** Returns true if this chat is within the flood-control limit. */
export async function checkRateLimit(chatId: string): Promise<boolean> {
  const now = Date.now();
  const history = chatRateLimits.get(chatId) || [];
  const valid = history.filter((ts) => now - ts < WINDOW_MS);
  if (valid.length >= MAX_MESSAGES_PER_WINDOW) {
    return false;
  }
  valid.push(now);
  chatRateLimits.set(chatId, valid);
  return true;
}
