/**
 * Barrel for the SDK's HTTP infrastructure layer. Everything above this layer (REST framework,
 * OData framework, providers) depends only on {@link IHttpClient}; nothing outside `sdk/http`
 * should import `FetchHttpClient` directly except where the concrete implementation must be
 * constructed (SDK composition root).
 */
export type { IHttpClient } from "./IHttpClient.js";
export { FetchHttpClient, type FetchHttpClientOptions } from "./FetchHttpClient.js";
export {
  DEFAULT_RETRY_POLICY,
  type BodyEncoding,
  type HttpMethod,
  type HttpRequestBody,
  type HttpRequestOptions,
  type HttpResponse,
  type MultipartField,
  type RetryPolicy,
} from "./HttpTypes.js";
export { RetryExecutor, type AttemptOutcome } from "./RetryExecutor.js";
export { RequestIdGenerator } from "./RequestIdGenerator.js";
export {
  httpMetricsRecorder,
  HttpMetricsRecorder,
  type HttpEndpointStats,
  type HttpMetricSample,
} from "./HttpMetricsRecorder.js";
export type { IHttpInterceptor } from "./interceptors/IHttpInterceptor.js";
export {
  CorrelationIdInterceptor,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from "./interceptors/CorrelationIdInterceptor.js";
export { LoggingInterceptor } from "./interceptors/LoggingInterceptor.js";
export { MetricsInterceptor } from "./interceptors/MetricsInterceptor.js";
