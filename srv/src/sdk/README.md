# Integration Suite SDK (`srv/src/sdk/`)

The platform SDK: the **only** layer permitted to communicate with SAP Integration Suite. Every
future module (Monitoring, JMS, Payload Viewer, Certificates, …) consumes this SDK — never `fetch`,
`axios`, or any HTTP library directly.

**Phase 4** built the reusable infrastructure (HTTP, auth, destination, OData, REST, pipeline) and
wired every sub-client to a mock-data provider — no live upstream call was made anywhere.

**Phase 5** completes the seam: every provider contract now has both a mock implementation
(`sdk/providers/Mock*`) and a live, Integration-Suite-backed implementation (`sdk/providers/Real*`),
built on exactly the Phase-4 infrastructure. Which one backs a given sub-client is selected by
`IntegrationSuiteSdkClient`'s `providerMode` option — `"mock"` (default, Phase-4 behaviour, unchanged)
or `"real"` — never by a code change. See [`docs/CONNECTIVITY_GUIDE.md`](../../../docs/CONNECTIVITY_GUIDE.md)
for how an operator switches a deployment from mock to real.

## Layout

| Folder | Purpose | README |
|---|---|---|
| `models/` | Cross-cutting vocabulary every layer shares (`RequestContext`, `TenantContext`, `PagedResponse`, …). | — |
| `errors/` | Transport-level errors (`TimeoutError`, `NetworkError`, `RateLimitError`) + `HttpErrorTranslator`. | [errors](errors/README.md) |
| `http/` | The HTTP transport: `IHttpClient`/`FetchHttpClient`, retry, timeout, interceptors, metrics. | [http](http/README.md) |
| `auth/` | Pluggable authentication: Basic, OAuth Client Credentials, token caching, a config-driven factory. | [auth](auth/README.md) |
| `destination/` | Resolves a tenant id into a ready-to-call `TenantContext` (base URL + live auth headers). | [destination](destination/README.md) |
| `odata/` | Fluent OData query builder, filter expressions, response/metadata/batch parsing. | [odata](odata/README.md) |
| `rest/` | Generic REST framework (JSON/XML/binary/multipart) built on `sdk/http`. | [rest](rest/README.md) |
| `pipeline/` | `RequestPipeline` — orchestrates validation → destination resolution → transport → caching. | [pipeline](pipeline/README.md) |
| `mock/` | The mock engine + realistic per-domain data fixtures. | [mock](mock/README.md) |
| `dto/` | The SDK's DTO surface (re-exports Phase-3 domain types + new ones this phase introduces). | — |
| `providers/` | Mock **and** real implementations of every `core/providers/I*Provider` contract. | [providers](providers/README.md) |
| `client/` | `IntegrationSuiteSdkClient` — the SDK's public entry point, composing 10 sub-clients. | [client](client/README.md) |

## Layering rule

```
client/  →  providers/Mock*  →  mock/                                       (providerMode: "mock")
client/  →  providers/Real*  →  pipeline/  →  destination/ + auth/  →  rest/|odata/  →  http/  (providerMode: "real")
```

The composition root that turns this application's own configuration (`config/connectivity.json`,
`config/tenants.json`, environment-scoped secrets) into the options `IntegrationSuiteSdkClient` takes
lives outside the SDK, at `srv/src/config/sdkClientFactory.ts` — the SDK itself never reads
`config/*.json` (see `sdk/auth/README.md`'s `AuthProviderFactory` note for why), keeping it reusable
in other Node.js projects.

Module services depend on `IntegrationSuiteSdkClient` only. Nothing above the SDK imports
`sdk/http`, `sdk/providers`, etc. directly.

## Design principles (carried through every sub-layer)

- **Interfaces over concretions.** `IHttpClient`, `IAuthProvider`, `IDestinationResolver`,
  `IDestinationDiscoveryProvider` are all swappable without touching their callers.
- **Dependency injection, not singletons-by-default.** Every class takes its dependencies as
  constructor parameters (the one exception, `httpMetricsRecorder`, is an explicitly-documented
  process-wide default that can still be overridden).
- **No framework/UI coupling.** Nothing here imports UI5 or knows this SDK is embedded in a larger
  Fiori-style application; it depends only on `core/errors`, `core/logging`, and `core/providers`
  (the Phase 1/3 platform primitives), and could be extracted into a standalone npm package with
  those three folders.
- **Composition over inheritance.** No class hierarchy is deeper than one level; behaviour is
  assembled from small, focused collaborators (interceptors, providers, resolvers).

## Testing

See `srv/test/unit/sdk/` — covering the mock engine, OData builder/parser/metadata/batch (including
the real `ODataClient`), error translation, auth providers/token cache/factory, the BTP destination
discovery provider, seven mock providers, seven real providers (each against a stubbed `IHttpClient`
— no network access), HTTP retry/timeout behaviour (via a stubbed `fetch`), and mock-vs-real
provider compatibility (same domain-object shape from either implementation). Run with
`npm test --workspace=srv`.
