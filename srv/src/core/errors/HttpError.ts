import { AppError } from "./AppError.js";

/**
 * Client-facing 4xx errors with a stable code taxonomy. Factory methods cover the common cases so
 * controllers/services throw semantically (`HttpError.notFound(...)`) rather than assembling status
 * codes by hand.
 */
export class HttpError extends AppError {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message, details);
    this.statusCode = statusCode;
    this.code = code;
  }

  /** 400 Bad Request. */
  public static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "BAD_REQUEST", message, details);
  }

  /** 401 Unauthorized. */
  public static unauthorized(message = "Authentication required."): HttpError {
    return new HttpError(401, "UNAUTHORIZED", message);
  }

  /** 403 Forbidden. */
  public static forbidden(message = "Insufficient permissions."): HttpError {
    return new HttpError(403, "FORBIDDEN", message);
  }

  /** 404 Not Found. */
  public static notFound(message = "Resource not found."): HttpError {
    return new HttpError(404, "NOT_FOUND", message);
  }

  /** 409 Conflict. */
  public static conflict(message: string, details?: unknown): HttpError {
    return new HttpError(409, "CONFLICT", message, details);
  }

  /** 422 Unprocessable Entity (validation failure). */
  public static validation(message: string, details?: unknown): HttpError {
    return new HttpError(422, "VALIDATION_FAILED", message, details);
  }
}
