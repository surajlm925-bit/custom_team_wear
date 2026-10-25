/**
 * Webhook dedupe on update_id — PRD §8.4, §9.1.
 * Uses an in-memory set for instantaneous deduplication without network latency.
 */

const seenUpdates = new Set<string>();
const MAX_SEEN = 10000;

/** Returns true if this update_id has NOT been seen before (i.e. safe to process). */
export async function claimUpdate(updateId: string): Promise<boolean> {
  if (seenUpdates.has(updateId)) {
    return false;
  }
  if (seenUpdates.size >= MAX_SEEN) {
    seenUpdates.clear();
  }
  seenUpdates.add(updateId);
  return true;
}
