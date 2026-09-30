import { Transaction } from '../models/Transaction';

const processedMessageCache = new Map<string, number>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const MAX_CACHE_SIZE = 10000;

/**
 * Prunes expired message IDs from the in-memory cache.
 */
function pruneCache(): void {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageCache.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      processedMessageCache.delete(id);
    }
  }

  // If still above max size, remove oldest entries
  if (processedMessageCache.size > MAX_CACHE_SIZE) {
    const keys = Array.from(processedMessageCache.keys()).slice(
      0,
      processedMessageCache.size - MAX_CACHE_SIZE
    );
    for (const key of keys) {
      processedMessageCache.delete(key);
    }
  }
}

/**
 * Marks a WhatsApp message ID as processed in the high-speed idempotency cache.
 */
export function markMessageProcessed(whatsappMessageId: string): void {
  if (!whatsappMessageId) return;
  pruneCache();
  processedMessageCache.set(whatsappMessageId, Date.now());
}

/**
 * Returns true if a message with this WhatsApp message ID has already been processed,
 * checking both the in-memory cache and the persistent MongoDB Transaction records.
 */
export async function isMessageProcessed(whatsappMessageId: string): Promise<boolean> {
  if (!whatsappMessageId) return false;

  // 1. Check in-memory fast cache
  if (processedMessageCache.has(whatsappMessageId)) {
    const timestamp = processedMessageCache.get(whatsappMessageId)!;
    if (Date.now() - timestamp < CACHE_TTL_MS) {
      return true;
    }
    processedMessageCache.delete(whatsappMessageId);
  }

  // 2. Check persistent MongoDB Transaction database
  const existing = await Transaction.findOne({ whatsappMessageId }).select('_id').lean();
  if (existing) {
    markMessageProcessed(whatsappMessageId);
    return true;
  }

  return false;
}

/**
 * Clears the in-memory processed cache (useful for test isolation).
 */
export function clearProcessedMessageCache(): void {
  processedMessageCache.clear();
}
