/**
 * Retry lifecycle states for a message travelling through a retry/DLQ flow. Consumed later by the
 * JMS Retry Center and Message Replay modules; centralized now so state handling and colouring are
 * defined once (Phase-3 constants mandate). Pairs with the queue retry strategies configured in
 * `config/queues.json`.
 */
export const RetryState = {
  /** Queued for retry; no attempt made yet. */
  Pending: "PENDING",
  /** A retry attempt is currently executing. */
  InProgress: "IN_PROGRESS",
  /** The last retry attempt succeeded; the message left the retry flow. */
  Succeeded: "SUCCEEDED",
  /** The last retry attempt failed; further attempts remain. */
  Failed: "FAILED",
  /** All configured attempts are used up; the message is parked in the DLQ. */
  Exhausted: "EXHAUSTED",
  /** An operator cancelled the retry flow for this message. */
  Cancelled: "CANCELLED",
} as const;

/** Union of all retry states. */
export type RetryStateValue = (typeof RetryState)[keyof typeof RetryState];
