/**
 * Discriminator identifying the category of an {@link AppError}. Drives how the
 * {@link module:com/middlewareops/integrationportal/core/errors/ErrorHandler} presents it.
 *
 * - `VALIDATION`        — client-side input failure; inline handling preferred.
 * - `NETWORK`           — transport failure (offline, timeout, aborted).
 * - `AUTH`              — authentication failure; triggers a re-auth flow.
 * - `AUTHORIZATION`     — authenticated but lacking permission; non-blocking notice.
 * - `CONFIGURATION`     — invalid/missing client configuration; blocking (app cannot proceed).
 * - `BACKEND`           — backend failure via the normalized API error envelope.
 * - `INTEGRATION_SUITE` — failure reported by an Integration Suite API (via the backend).
 * - `SERVICE`           — failure inside a frontend service's own logic.
 * - `UNKNOWN`           — anything that fits no other category.
 */
export type AppErrorKind =
  | "VALIDATION"
  | "NETWORK"
  | "AUTH"
  | "AUTHORIZATION"
  | "CONFIGURATION"
  | "BACKEND"
  | "INTEGRATION_SUITE"
  | "SERVICE"
  | "UNKNOWN";

/**
 * Base class for all client-side errors in the Integration Portal.
 *
 * Every error surfaced to the user carries a {@link AppError.correlationId} so a support request
 * can be traced across the frontend log, the backend log and (where propagated) the Integration
 * Suite log. Subclasses set the {@link AppError.kind} discriminator; presentation logic switches on
 * it rather than on `instanceof` chains.
 */
export abstract class AppError extends Error {
  /** Category discriminator used by the {@link ErrorHandler}. */
  public abstract readonly kind: AppErrorKind;

  /** Stable machine-readable error code (mirrors the backend envelope where applicable). */
  public readonly code: string;

  /** Correlation id linking this error to server-side logs. */
  public readonly correlationId: string;

  /** Optional structured detail payload for diagnostics. */
  public readonly details?: unknown;

  public constructor(
    message: string,
    options: { code?: string; correlationId?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? "UNKNOWN";
    this.correlationId = options.correlationId ?? "n/a";
    this.details = options.details;
  }
}
