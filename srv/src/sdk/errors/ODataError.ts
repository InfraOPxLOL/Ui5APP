import { AppError } from "../../core/errors/AppError.js";

/**
 * A malformed OData response: the body could not be parsed as JSON, or lacked the `d.results`/
 * `value` envelope shape either OData version requires (architecture: Error Handling, §12 —
 * "Malformed OData"). Distinguishes "the server responded but the payload is unusable" from a
 * transport failure ({@link NetworkError}) or a well-formed error response
 * ({@link HttpErrorTranslator.translate}) — all three reach the caller as a typed {@link AppError},
 * never a raw `SyntaxError`.
 */
export class ODataError extends AppError {
  public readonly statusCode: number = 502;
  public readonly code: string = "ODATA_MALFORMED_RESPONSE";

  public constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, details, cause);
  }
}
