# `sdk/http/` — HTTP infrastructure

The SDK's transport layer. **No module, provider, or sub-client constructs an HTTP request itself**
— everything funnels through an `IHttpClient`.

## Key types

| Type | Role |
|---|---|
| `IHttpClient` | The transport abstraction (`execute(options, context)`). Depend on this, not `FetchHttpClient`. |
| `FetchHttpClient` | The concrete implementation, built on the platform `fetch`. Owns retries, timeout/cancellation, compression negotiation, body encoding, and the interceptor chain. |
| `HttpRequestOptions` / `HttpResponse` | The request/response shapes `IHttpClient` speaks. |
| `RetryPolicy` / `RetryExecutor` | Exponential-backoff retry, framework-agnostic (doesn't know about HTTP specifically). |
| `HttpMetricsRecorder` | In-memory per-endpoint timing/outcome stats (`httpMetricsRecorder` is the process-wide default). |
| `RequestIdGenerator` | Per-attempt request ids, distinct from the correlation id (stable across retries). |

## Interceptors (`http/interceptors/`)

`IHttpInterceptor` hooks (`beforeRequest` / `afterResponse` / `onError`) run in registration order
outbound and reverse order inbound (the usual "middleware onion"). Three ship today:

- `CorrelationIdInterceptor` — stamps `X-Correlation-Id` (stable) and `X-Request-Id` (per attempt).
- `LoggingInterceptor` — one structured log line per request/response/error, category `sdk.http`.
- `MetricsInterceptor` — records each call into an `HttpMetricsRecorder`.

## Body encoding

`HttpRequestBody` is a discriminated union (`json` | `xml` | `text` | `binary` | `multipart`).
`FetchHttpClient` encodes each variant correctly (JSON stringify, raw string, `Uint8Array`,
`FormData`) and sets `Content-Type` unless the caller already supplied one. Responses are buffered
as text by default; pass `stream: true` for a `ReadableStream<Uint8Array>` (large downloads) or
`binaryResponse: true` for a buffered `Uint8Array` (small binary payloads — certificates, etc.).

## Timeouts and cancellation

Each attempt gets its own internal `AbortController` timer; a caller-supplied `signal` is merged
with it (`FetchHttpClient.mergeSignals`), so either the timeout or explicit cancellation aborts the
in-flight `fetch`. Timeouts are classified as `TimeoutError`; any other thrown fetch failure is
classified as `NetworkError` (see `sdk/errors`).

## Testing

`srv/test/unit/sdk/httpClient.test.ts` stubs `globalThis.fetch` to verify: first-attempt success,
retry-then-succeed, exhausting retries on a persistent failure, non-retryable statuses stopping
immediately, and timeout classification.
