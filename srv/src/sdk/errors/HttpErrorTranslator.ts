import { AppError } from "../../core/errors/AppError.js";
import { AuthenticationError, AuthorizationError } from "../../core/errors/AuthErrors.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { IntegrationSuiteError } from "../../core/errors/IntegrationSuiteError.js";
import { RateLimitError } from "./RateLimitError.js";
import { TimeoutError } from "./TimeoutError.js";
import { NetworkError } from "./NetworkError.js";
import type { ErrorResponse } from "../models/ErrorResponse.js";

/**
 * Translates a normalized upstream {@link ErrorResponse} into the SDK's typed error taxonomy — the
 * single place an HTTP status code is switched on to decide what kind of failure this is
 * (architecture: Error Translation, §8). Every SDK transport call (HTTP, REST, OData) funnels its
 * failure through {@link HttpErrorTranslator.translate}; nothing above the transport layer ever
 * inspects a raw status code again.
 *
 * Mapping:
 * - `401` → {@link AuthenticationError}
 * - `403` → {@link AuthorizationError}
 * - `404` → {@link HttpError} (`code: "NOT_FOUND"`)
 * - `408` → {@link TimeoutError}
 * - `409` → {@link HttpError} (`code: "CONFLICT"`)
 * - `429` → {@link RateLimitError}
 * - `500`, `502`, `503` → {@link IntegrationSuiteError} (tenant-aware upstream fault)
 * - `504` → {@link TimeoutError}
 * - anything else → {@link IntegrationSuiteError} (safe default: treat as an upstream fault)
 */
export class HttpErrorTranslator {
  /**
   * Translates a normalized error response into a typed {@link AppError}.
   * @param tenantId the tenant the failing call targeted.
   * @param error the normalized upstream error.
   * @returns the typed application error to throw.
   */
  public static translate(tenantId: string, error: ErrorResponse): AppError {
    switch (error.httpStatus) {
      case 401:
        return new AuthenticationError(error.message, { upstreamCode: error.upstreamCode });
      case 403:
        return new AuthorizationError(error.message);
      case 404:
        return HttpError.notFound(error.message);
      case 408:
        return new TimeoutError(0, error.message);
      case 409:
        return HttpError.conflict(error.message);
      case 429:
        return new RateLimitError(error.message, HttpErrorTranslator.retryAfterMs(error));
      case 500:
      case 502:
      case 503:
        return IntegrationSuiteError.fromCpiResponse(tenantId, error.httpStatus, error.rawBody);
      case 504:
        return new TimeoutError(0, error.message);
      default:
        return IntegrationSuiteError.fromCpiResponse(tenantId, error.httpStatus, error.rawBody);
    }
  }

  /**
   * Translates a transport-level failure (no HTTP response at all) — either a timeout or a network
   * failure, distinguished by the caller (the transport knows which one occurred).
   * @param kind whether the transport aborted on timeout or failed to connect.
   * @param detail timeout budget (ms) for `"timeout"`, or the underlying cause for `"network"`.
   * @returns the typed transport error.
   */
  public static translateTransportFailure(
    kind: "timeout" | "network",
    detail: number | unknown,
  ): AppError {
    return kind === "timeout"
      ? new TimeoutError(typeof detail === "number" ? detail : 0)
      : new NetworkError(undefined, detail);
  }

  private static retryAfterMs(error: ErrorResponse): number | undefined {
    const rawBody = error.rawBody as { retryAfterSeconds?: number } | undefined;
    return rawBody?.retryAfterSeconds !== undefined ? rawBody.retryAfterSeconds * 1000 : undefined;
  }
}
