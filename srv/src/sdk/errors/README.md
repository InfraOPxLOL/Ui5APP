# `sdk/errors/` — error translation

Maps upstream HTTP status codes (and transport-level failures) to the SDK's typed error taxonomy
(architecture: Error Translation, §8). Every SDK transport call funnels its failure through
`HttpErrorTranslator` — nothing above the transport layer inspects a raw status code again.

## New errors introduced here

| Class | Meaning |
|---|---|
| `TimeoutError` | No response arrived within budget (connection or overall request timeout). |
| `NetworkError` | The upstream host could not be reached at all (DNS/connection/TLS failure) — distinct from a timeout (a connection attempt was made) and from an upstream error response (a response *was* received). |
| `RateLimitError` | Upstream responded 429; carries `retryAfterMs` when the upstream provided a hint. |
| `ODataError` | **Phase 5.** A response *was* received with a 2xx status, but its body is not valid JSON or matches neither the OData v2 (`d.results`) nor v4 (`value`) envelope shape. Raised by `ODataResponseParser`/`ODataClient` — callers never see a raw `SyntaxError`. |

## Reused from `core/errors/` (Phase 1/3 — not duplicated)

`AuthenticationError` (401), `AuthorizationError` (403), `HttpError` (404 `NOT_FOUND`, 409
`CONFLICT` — via its existing parametrized constructor plus a small added `conflict()` factory),
`IntegrationSuiteError` (500/502/503, tenant-tagged), `ServiceError` (the request pipeline's
catch-all for non-`AppError` throwables).

## `HttpErrorTranslator.translate(tenantId, errorResponse)`

The single switch over HTTP status. `translateTransportFailure(kind, detail)` is the sibling entry
point for failures that never produced a response at all (called by `FetchHttpClient` to classify a
timeout vs. a network failure).
