import type { IHttpInterceptor } from "./IHttpInterceptor.js";
import type { HttpRequestOptions, HttpResponse } from "../HttpTypes.js";
import type { OperationContext } from "../../models/OperationContext.js";
import { getLogger } from "../../../core/logging/logger.js";

/**
 * Logs one structured line per request and one per response/error, tagged with the SDK's
 * `sdk.http` category (architecture: HTTP Infrastructure, "Request logging"/"Response logging";
 * SDK Logging, §13 — correlation id, request id, duration, endpoint, status, retries all appear
 * here). Uses the platform's category-logger convention from Phase 3.
 */
export class LoggingInterceptor implements IHttpInterceptor {
  public readonly name = "logging";
  private readonly logger = getLogger("sdk.http");

  public beforeRequest(options: HttpRequestOptions, context: OperationContext): HttpRequestOptions {
    this.logger.debug(
      {
        correlationId: context.request.correlationId,
        requestId: context.requestId,
        operation: context.operationName,
        method: options.method,
        url: options.url,
        attempt: context.attempt,
      },
      "sdk.http.request",
    );
    return options;
  }

  public afterResponse(response: HttpResponse, context: OperationContext): void {
    const level = response.ok ? "debug" : "warn";
    this.logger[level](
      {
        correlationId: context.request.correlationId,
        requestId: context.requestId,
        operation: context.operationName,
        status: response.status,
        durationMs: response.durationMs,
        attempts: response.attempts,
      },
      "sdk.http.response",
    );
  }

  public onError(error: unknown, context: OperationContext): void {
    this.logger.error(
      {
        correlationId: context.request.correlationId,
        requestId: context.requestId,
        operation: context.operationName,
        err: error instanceof Error ? error.message : String(error),
      },
      "sdk.http.error",
    );
  }
}
