/**
 * Base shape every SDK request payload extends. Carries nothing by itself today; it exists so a
 * cross-cutting request field (e.g. a future idempotency key) can be added once, here, and every
 * request DTO picks it up without individual changes — the same reasoning as `BaseResponse`.
 */
export interface BaseRequest {
  /** Optional idempotency key for safely-retryable mutating operations. */
  readonly idempotencyKey?: string;
}
