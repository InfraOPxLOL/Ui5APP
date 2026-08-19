import type { QueueRuntimeInfo, QueuedMessage } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";
import {
  MOCK_FRAMEWORK_ABSENT_MESSAGE_IDS,
  MOCK_FRAMEWORK_MESSAGE_QUEUES,
  MOCK_JMS_RESOLVED_QUEUE,
  MOCK_JMS_SOURCE_MESSAGE_ID,
} from "./MessageFixtures.js";

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
 * Where a message has been relocated to by a mock `MoveMessagingMessages` call, keyed by message id.
 *
 * Mock mode is otherwise purely generative — every lookup recomputes the same deterministic answer
 * from a seed, with no state. A move, though, is only meaningful if the *next* lookup reflects it:
 * dead-letter recovery is `MOVE` → **verify the message really arrived** → `RETRY`, and a stateless
 * fixture would fail that verification every time, making the whole recovery path untestable without
 * a live tenant. This ledger is the minimum state that makes the sequence honest in mock mode: once a
 * message is moved it is present on the target queue and absent everywhere else, exactly as a real
 * broker would report.
 *
 * Process-lifetime and never persisted; {@link resetMockMoves} exists so tests start clean.
 */
const relocatedMessages = new Map<string, string>();

/**
 * Records a mock move so subsequent {@link generateSingleMessage} lookups reflect it.
 * @param targetQueue the queue the messages now sit on.
 * @param messageIds the moved message ids.
 */
export function recordMockMove(targetQueue: string, messageIds: readonly string[]): void {
  for (const messageId of messageIds) {
    relocatedMessages.set(messageId, targetQueue);
  }
}

/** Clears the mock relocation ledger — call between tests that exercise moves. */
export function resetMockMoves(): void {
  relocatedMessages.clear();
}

/**
 * Generates the keyed single-message lookup (`MessagingMessages(jmsMessageId=..,queueName=..)`) a
 * JMS retry-check performs. Resolution order:
 *
 * 1. A message moved by {@link recordMockMove} is present **only** on the queue it was moved to.
 * 2. The JMS-bridge fixture message ({@link MOCK_JMS_SOURCE_MESSAGE_ID}) is deterministically present
 *    on its resolved queue ({@link MOCK_JMS_RESOLVED_QUEUE}) — the "found in original queue" branch.
 * 3. A message in `MOCK_FRAMEWORK_ABSENT_MESSAGE_IDS` is present nowhere, so the "detected but parked
 *    nowhere" path stays reachable instead of being randomised away by rule 5.
 * 4. A framework-scenario message is present on exactly the queue its fixture parks it on, so each
 *    framework's traversal and DLQ-recovery path is deterministically reachable.
 * 5. Everything else is deterministically pseudo-random (~60% present) so the "found in DLQ" and
 *    "not found anywhere, pick manually" branches both stay reachable.
 *
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
  const relocatedTo = relocatedMessages.get(messageId);
  if (relocatedTo !== undefined) {
    return relocatedTo === queueName
      ? {
          messageId,
          queueName,
          enqueuedAt: new Date().toISOString(),
          retryCount: 0,
          sizeBytes: 4096,
        }
      : undefined;
  }

  if (messageId === MOCK_JMS_SOURCE_MESSAGE_ID) {
    return queueName === MOCK_JMS_RESOLVED_QUEUE
      ? { messageId, queueName, enqueuedAt: new Date(Date.now() - 120_000).toISOString(), retryCount: 2, sizeBytes: 4096 }
      : undefined;
  }

  if (MOCK_FRAMEWORK_ABSENT_MESSAGE_IDS.has(messageId)) {
    return undefined;
  }

  const parkedOn = MOCK_FRAMEWORK_MESSAGE_QUEUES[messageId];
  if (parkedOn !== undefined) {
    return parkedOn === queueName
      ? {
          messageId,
          queueName,
          enqueuedAt: new Date(Date.now() - 300_000).toISOString(),
          retryCount: 1,
          sizeBytes: 8192,
        }
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
