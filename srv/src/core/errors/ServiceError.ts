import { AppError } from "./AppError.js";

/**
 * A failure inside a backend service's own logic (mapping, aggregation, invariant violation) —
 * as opposed to invalid client input ({@link HttpError}) or an upstream fault
 * ({@link UpstreamError}/{@link IntegrationSuiteError}).
 *
 * Services throw this when *their* processing cannot complete; the terminal error middleware
 * responds 500 with the stable `SERVICE_ERROR` code while the message stays safe to expose.
 */
export class ServiceError extends AppError {
  public readonly statusCode: number = 500;
  public readonly code: string = "SERVICE_ERROR";

  public constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, details, cause);
  }
}
