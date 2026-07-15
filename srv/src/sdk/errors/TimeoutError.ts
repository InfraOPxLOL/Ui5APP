import { AppError } from "../../core/errors/AppError.js";

/**
 * A request exceeded its connection or overall request timeout before a response was received.
 * Distinct from {@link UpstreamError} (which means the upstream *did* respond, just with an error
 * status) — a timeout means no response arrived at all, so retries are generally safe for
 * idempotent operations.
 */
export class TimeoutError extends AppError {
  public readonly statusCode: number = 504;
  public readonly code: string = "TIMEOUT";

  /** The timeout budget that was exceeded, in milliseconds. */
  public readonly timeoutMs: number;

  public constructor(timeoutMs: number, message = `The request timed out after ${timeoutMs}ms.`) {
    super(message, { timeoutMs });
    this.timeoutMs = timeoutMs;
  }
}
