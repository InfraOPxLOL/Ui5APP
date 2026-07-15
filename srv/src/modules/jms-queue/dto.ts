/**
 * Data transfer objects for the JMS Queues module. These are the platform's stable shapes; the
 * service maps raw CPI payloads into them so no upstream shape leaks past the service layer.
 */

/** A single JMS Queues row. */
export interface JmsQueueDto {
  readonly queueName: string;
  readonly state: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly capacityUsedPct: number;
}

/** Result of the purge action. */
export interface PurgeResultDto {
  readonly queueName: string;
  readonly purgedCount: number;
}
