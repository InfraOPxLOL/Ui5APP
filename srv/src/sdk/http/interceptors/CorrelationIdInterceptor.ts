import type { IHttpInterceptor } from "./IHttpInterceptor.js";
import type { HttpRequestOptions } from "../HttpTypes.js";
import type { OperationContext } from "../../models/OperationContext.js";
import { RequestIdGenerator } from "../RequestIdGenerator.js";

/** Header carrying the correlation id across service boundaries (matches the platform-wide header). */
export const CORRELATION_ID_HEADER = "X-Correlation-Id";
/** Header carrying the per-attempt request id. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Stamps every outbound request with its correlation id (stable across retries) and a fresh
 * request id (unique per attempt), and records the request id onto the operation context so later
 * interceptors/logging can reference it (architecture: HTTP Infrastructure, "Automatic request
 * IDs", "Correlation IDs").
 */
export class CorrelationIdInterceptor implements IHttpInterceptor {
  public readonly name = "correlation-id";

  public beforeRequest(options: HttpRequestOptions, context: OperationContext): HttpRequestOptions {
    const requestId = RequestIdGenerator.next();
    context.requestId = requestId;
    return {
      ...options,
      headers: {
        ...options.headers,
        [CORRELATION_ID_HEADER]: context.request.correlationId,
        [REQUEST_ID_HEADER]: requestId,
      },
    };
  }
}
