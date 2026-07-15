import type { HealthStatus } from "../transform/index.js";

/**
 * The business-friendly view of one JMS queue (architecture: Phase 6, Queue Engine, §9). Merges live
 * runtime state (`sdk.jms`) with static topology metadata (`config/queues.json`, via
 * `ConfigService.getQueues()`) into a single object — a caller never needs to join the two itself.
 */
export interface QueueSummary {
  readonly queueName: string;
  readonly displayName: string;
  readonly description: string;
  readonly state: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly capacityUsedPct: number;
  readonly utilization: number;
  readonly health: HealthStatus;
  readonly deadLetterQueue: string;
  readonly retryQueue: string;
  readonly priority: number;
  readonly retryStrategy: string;
  readonly maxRetries: number;
}

/** The business-friendly view of one message currently parked on a queue — a retry candidate. */
export interface QueuedMessageSummary {
  readonly messageId: string;
  readonly queueName: string;
  readonly enqueuedAt: string;
  readonly retryCount: number;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}
