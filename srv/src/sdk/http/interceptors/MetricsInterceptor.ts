import type { IHttpInterceptor } from "./IHttpInterceptor.js";
import type { HttpRequestOptions, HttpResponse } from "../HttpTypes.js";
import type { OperationContext } from "../../models/OperationContext.js";
import { httpMetricsRecorder, type HttpMetricsRecorder } from "../HttpMetricsRecorder.js";

/**
 * Records request timing/outcome into an {@link HttpMetricsRecorder} (architecture: HTTP
 * Infrastructure, "Metrics", "Performance timings", "Request duration"). Defaults to the
 * process-wide recorder; a dedicated instance may be injected for test isolation.
 */
export class MetricsInterceptor implements IHttpInterceptor {
  public readonly name = "metrics";

  public constructor(private readonly recorder: HttpMetricsRecorder = httpMetricsRecorder) {}

  public beforeRequest(options: HttpRequestOptions): HttpRequestOptions {
    return options;
  }

  public afterResponse(response: HttpResponse, context: OperationContext): void {
    this.recorder.record({
      method: context.bag.method as string,
      endpoint: context.bag.endpoint as string,
      status: response.status,
      durationMs: response.durationMs,
      attempts: response.attempts,
      succeeded: response.ok,
      timestamp: Date.now(),
    });
  }

  public onError(_error: unknown, context: OperationContext): void {
    this.recorder.record({
      method: (context.bag.method as string) ?? "UNKNOWN",
      endpoint: (context.bag.endpoint as string) ?? context.operationName,
      status: undefined,
      durationMs: context.startedAt !== undefined ? Date.now() - context.startedAt : 0,
      attempts: context.attempt,
      succeeded: false,
      timestamp: Date.now(),
    });
  }
}
