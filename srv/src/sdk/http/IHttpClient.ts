import type { HttpRequestOptions, HttpResponse } from "./HttpTypes.js";
import type { OperationContext } from "../models/OperationContext.js";

/**
 * The transport abstraction every higher SDK layer (REST framework, OData framework) is built on.
 * No module, provider, or sub-client may construct HTTP requests itself — everything funnels
 * through an `IHttpClient` (architecture: HTTP Infrastructure, §1 — "No module should ever
 * directly create HTTP requests").
 *
 * Implementations own retries, timeouts, cancellation, compression and the interceptor chain;
 * callers supply only the logical request and an {@link OperationContext} for tracing.
 */
export interface IHttpClient {
  /**
   * Executes one HTTP request (with retries/timeout/interceptors already applied).
   * @param options the request to execute.
   * @param context the operation context (correlation id, tenant, attempt bookkeeping).
   * @returns the raw HTTP response.
   */
  execute(options: HttpRequestOptions, context: OperationContext): Promise<HttpResponse>;
}
