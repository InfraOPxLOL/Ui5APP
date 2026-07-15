import type { HttpRequestOptions, HttpResponse } from "../HttpTypes.js";
import type { OperationContext } from "../../models/OperationContext.js";

/**
 * Extension point for cross-cutting HTTP behaviour (architecture: Request Pipeline, §7 "Before
 * Request"/"After Response"; HTTP Infrastructure, §1 "Interceptors").
 *
 * Interceptors run around every request issued by an {@link IHttpClient}. Each hook may mutate the
 * request (returning a new options object) or observe the response/error; hooks run in
 * registration order for `beforeRequest` and reverse order for `afterResponse`/`onError` (the usual
 * "middleware onion" semantics), so the first interceptor to see the outbound request is the last
 * to see the inbound response.
 */
export interface IHttpInterceptor {
  /** A short name for logging/diagnostics (e.g. `correlation-id`, `metrics`). */
  readonly name: string;

  /**
   * Runs before the request is sent. May return modified options (e.g. added headers).
   * @param options the request about to be sent.
   * @param context the operation context (correlation id, tenant, attempt number).
   * @returns the (possibly modified) request options.
   */
  beforeRequest?(
    options: HttpRequestOptions,
    context: OperationContext,
  ): Promise<HttpRequestOptions> | HttpRequestOptions;

  /**
   * Runs after a response is received (any status, including error statuses).
   * @param response the raw HTTP response.
   * @param context the operation context.
   */
  afterResponse?(response: HttpResponse, context: OperationContext): Promise<void> | void;

  /**
   * Runs when the transport itself failed (no response — timeout or network error).
   * @param error the thrown error.
   * @param context the operation context.
   */
  onError?(error: unknown, context: OperationContext): Promise<void> | void;
}
