import { AppError } from "../../core/errors/AppError.js";

/**
 * The upstream API rejected the request for exceeding its own rate limit (HTTP 429). Carries the
 * `Retry-After` hint when the upstream provided one, so callers/retry policies can back off
 * intelligently instead of guessing.
 */
export class RateLimitError extends AppError {
  public readonly statusCode: number = 429;
  public readonly code: string = "RATE_LIMITED";

  /** Suggested wait time before retrying, in milliseconds, when known. */
  public readonly retryAfterMs?: number;

  public constructor(message = "The upstream API rate limit was exceeded.", retryAfterMs?: number) {
    super(message, retryAfterMs !== undefined ? { retryAfterMs } : undefined);
    this.retryAfterMs = retryAfterMs;
  }
}
