import type { QueueRuntimeInfo, QueuedMessage } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";
import { MOCK_JMS_RESOLVED_QUEUE, MOCK_JMS_SOURCE_MESSAGE_ID } from "./MessageFixtures.js";

/** The fixed mock dead-letter queue name — mirrors the real, single `Common_JMS_ID_DLQ` convention. */
export const MOCK_CENTRAL_DLQ_QUEUE = "Common_JMS_ID_DLQ";

const STATES = ["RUNNING", "RUNNING", "STOPPED", "ERROR"];

/**
 * Representative queue names for `Fetch_All` discovery in mock mode — standing in for whatever a
 * live tenant actually reports, independent of `config/queues.json` (mirrors the real-world case
 * where a tenant's queues don't match the platform's own placeholder configuration).
 */
export const MOCK_DISCOVERED_QUEUE_NAMES: readonly string[] = [
  "DISCOVERED.QUEUE.ALPHA",
  "DISCOVERED.QUEUE.BETA",
];

/**
 * Generates realistic {@link QueueRuntimeInfo} entries for the given queue names, for the mock
 * engine's `JmsProvider` implementation.
 * @param queueNames the physical queue names to generate state for.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns runtime info per queue, in input order.
 */
export function generateQueueStates(queueNames: readonly string[], seed = 42): QueueRuntimeInfo[] {
  const rng = new SeededRandom(seed);
  return queueNames.map((queueName) => {
    const messageCount = rng.int(0, 5000);
    return {
      queueName,
      state: rng.pick(STATES),
      messageCount,
      consumerCount: rng.int(0, 4),
      capacityUsedPct: Math.min(100, Math.round((messageCount / 5000) * 100)),
    };
  });
}

/**
 * Generates a deterministic list of realistic {@link QueuedMessage} entries for one queue.
 * @param queueName the physical queue name the messages belong to.
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated queued messages, oldest first.
 */
export function generateQueuedMessages(
  queueName: string,
  count: number,
  seed = 42,
): QueuedMessage[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    messageId: `qmsg-${(seed * 1000 + index).toString(16)}`,
    queueName,
    enqueuedAt: new Date(now - (count - index) * 45000).toISOString(),
    retryCount: rng.int(0, 3),
    sizeBytes: rng.int(256, 65536),
  }));
}

/**
 * Generates the keyed single-message lookup (`MessagingMessages(jmsMessageId=..,queueName=..)`) a
 * JMS retry-check performs. The JMS-bridge fixture message ({@link MOCK_JMS_SOURCE_MESSAGE_ID}) is
 * deterministically present on its resolved queue ({@link MOCK_JMS_RESOLVED_QUEUE}) — the "found in
 * original queue" retry-check branch. Every other combination is deterministically pseudo-random
 * (~60% present) so the "found in DLQ" and "not found anywhere, pick manually" branches are both
 * reachable in mock mode.
 * @param queueName the physical queue name being checked.
 * @param messageId the message id being looked up.
 * @param seed PRNG seed for reproducibility.
 * @returns the queued message, or `undefined` when not present on this queue.
 */
export function generateSingleMessage(
  queueName: string,
  messageId: string,
  seed = 42,
): QueuedMessage | undefined {
  if (messageId === MOCK_JMS_SOURCE_MESSAGE_ID) {
    return queueName === MOCK_JMS_RESOLVED_QUEUE
      ? { messageId, queueName, enqueuedAt: new Date(Date.now() - 120_000).toISOString(), retryCount: 2, sizeBytes: 4096 }
      : undefined;
  }
  const rng = new SeededRandom(hashSeed(seed, queueName, messageId));
  if (!rng.chance(0.6)) {
    return undefined;
  }
  return {
    messageId,
    queueName,
    enqueuedAt: new Date(Date.now() - rng.int(1_000, 600_000)).toISOString(),
    retryCount: rng.int(0, 3),
    sizeBytes: rng.int(256, 65536),
  };
}

/** Derives a deterministic numeric seed from a base seed plus arbitrary strings. */
function hashSeed(seed: number, ...parts: readonly string[]): number {
  let hash = seed;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = (hash * 31 + part.charCodeAt(index)) | 0;
    }
  }
  return Math.abs(hash);
}
