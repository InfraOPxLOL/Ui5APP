import { AppError, type AppErrorKind } from "./AppError";
import type { ApiErrorEnvelope } from "../types/Api";

/**
 * Concrete {@link AppError} subclasses, one per {@link AppErrorKind}. Kept in a single file because
 * they are trivial specializations that share the base constructor; splitting them would add files
 * without adding meaning.
 */

/** A client-side input/validation failure — rendered inline, never as a blocking dialog. */
export class ValidationError extends AppError {
  public readonly kind: AppErrorKind = "VALIDATION";
}

/** A transport failure (offline, timeout, aborted) — rendered as a toast with retry. */
export class NetworkError extends AppError {
  public readonly kind: AppErrorKind = "NETWORK";
}

/** An authentication failure (session expired / not logged in) — triggers a re-auth flow. */
export class AuthError extends AppError {
  public readonly kind: AppErrorKind = "AUTH";
}

/** An authorization failure (authenticated but lacking a scope) — non-blocking notice. */
export class AuthorizationError extends AppError {
  public readonly kind: AppErrorKind = "AUTHORIZATION";
}

/** A configuration failure (client configuration missing/invalid) — blocking dialog. */
export class ConfigurationError extends AppError {
  public readonly kind: AppErrorKind = "CONFIGURATION";
}

/** A failure reported by an Integration Suite API, relayed through the backend envelope. */
export class IntegrationSuiteError extends AppError {
  public readonly kind: AppErrorKind = "INTEGRATION_SUITE";
}

/** A failure inside a frontend service's own logic (mapping, invariant violation). */
export class ServiceError extends AppError {
  public readonly kind: AppErrorKind = "SERVICE";
}

/** A backend/upstream failure surfaced through the normalized API error envelope. */
export class BackendError extends AppError {
  public readonly kind: AppErrorKind = "BACKEND";

  /**
   * Builds a {@link BackendError} from the backend's normalized error envelope.
   * @param envelope the parsed error envelope.
   * @returns a typed backend error carrying the envelope's code and correlation id.
   */
  public static fromEnvelope(envelope: ApiErrorEnvelope): BackendError {
    return new BackendError(envelope.message, {
      code: envelope.code,
      correlationId: envelope.correlationId,
      details: envelope.details,
    });
  }
}

/** Fallback for anything that does not fit another category. */
export class UnknownError extends AppError {
  public readonly kind: AppErrorKind = "UNKNOWN";
}

/**
 * Maps a backend error envelope to the most specific typed error, keyed by the envelope's stable
 * machine-readable code. Used by the {@link ApiClient} so callers receive (and presentation logic
 * switches on) the precise category rather than a generic backend error.
 * @param envelope the parsed error envelope.
 * @returns the most specific {@link AppError} for the envelope's code.
 */
export function errorFromEnvelope(envelope: ApiErrorEnvelope): AppError {
  const options = {
    code: envelope.code,
    correlationId: envelope.correlationId,
    details: envelope.details,
  };
  switch (envelope.code) {
    case "INTEGRATION_SUITE_ERROR":
    case "UPSTREAM_ERROR":
      return new IntegrationSuiteError(envelope.message, options);
    case "INSUFFICIENT_PERMISSIONS":
      return new AuthorizationError(envelope.message, options);
    case "AUTHENTICATION_REQUIRED":
      return new AuthError(envelope.message, options);
    case "CONFIGURATION_ERROR":
      return new ConfigurationError(envelope.message, options);
    case "VALIDATION_FAILED":
      return new ValidationError(envelope.message, options);
    default:
      return BackendError.fromEnvelope(envelope);
  }
}
