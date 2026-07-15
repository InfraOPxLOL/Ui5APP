/**
 * Request to retry/replay a single failed message, whether it originates from a JMS queue (the
 * future Retry Center) or from Message Monitoring (Message Replay). `queueName` is present only
 * for queue-originated retries.
 */
export interface RetryRequestDto {
  readonly messageId: string;
  readonly queueName?: string;
  /** Optional operator-supplied reason, captured in the audit log. */
  readonly reason?: string;
}

/** Outcome of a retry/replay request. */
export interface RetryResponseDto {
  readonly messageId: string;
  readonly accepted: boolean;
  readonly correlationId: string;
  /** Some replay flows produce a new message id distinct from the original; present when so. */
  readonly newMessageId?: string;
}
