/**
 * Base class for all backend errors.
 *
 * Every error carries a stable machine-readable {@link AppError.code} and an HTTP
 * {@link AppError.statusCode}; the terminal error middleware serializes these into the normalized
 * response envelope `{ code, message, correlationId, details? }`. Upstream (CPI) errors are mapped
 * into this taxonomy via {@link UpstreamError} so no raw CPI error shape ever reaches the client.
 */
export abstract class AppError extends Error {
  /** HTTP status code to respond with. */
  public abstract readonly statusCode: number;
  /** Stable, machine-readable error code. */
  public abstract readonly code: string;
  /** Whether this error is safe/expected (operational) vs. a programming fault. */
  public readonly isOperational: boolean = true;
  /** Optional structured detail for diagnostics (never leaks secrets). */
  public readonly details?: unknown;

  protected constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
    this.details = details;
  }
}
