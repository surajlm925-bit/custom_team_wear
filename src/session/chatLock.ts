/**
 * Per-chat "busy" lock — prevents a customer from sending a new message
 * while the bot is still working through their previous one.
 * Uses an in-memory lock for ultra-low latency response times.
 */

const localLocks = new Set<string>();

/** Attempts to claim the busy lock for this chat. Returns true if claimed. */
export async function acquireChatLock(chatId: string): Promise<boolean> {
  if (localLocks.has(chatId)) {
    return false;
  }
  localLocks.add(chatId);
  return true;
}

/** Releases the busy lock for this chat. Safe to call even if never acquired. */
export async function releaseChatLock(chatId: string): Promise<void> {
  localLocks.delete(chatId);
}
