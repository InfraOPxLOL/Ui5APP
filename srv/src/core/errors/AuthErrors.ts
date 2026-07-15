import { AppError } from "./AppError.js";

/**
 * Named authentication/authorization errors. `HttpError.unauthorized()` / `HttpError.forbidden()`
 * remain valid shortcuts; these named classes exist so services can throw (and tests can assert
 * on) semantically-typed errors rather than status-coded generics, per the Phase-3 error-framework
 * mandate.
 */

/** The caller is not authenticated (no or invalid credentials) — HTTP 401. */
export class AuthenticationError extends AppError {
  public readonly statusCode: number = 401;
  public readonly code: string = "AUTHENTICATION_REQUIRED";

  public constructor(message = "Authentication required.", details?: unknown) {
    super(message, details);
  }
}

/** The caller is authenticated but lacks the required scope/permission — HTTP 403. */
export class AuthorizationError extends AppError {
  public readonly statusCode: number = 403;
  public readonly code: string = "INSUFFICIENT_PERMISSIONS";

  /** The missing scope, when known — surfaced in the error envelope's details. */
  public readonly missingScope?: string;

  public constructor(message = "Insufficient permissions.", missingScope?: string) {
    super(message, missingScope !== undefined ? { missingScope } : undefined);
    this.missingScope = missingScope;
  }
}
