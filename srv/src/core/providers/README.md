# `core/providers/` — API foundation (abstract contracts)

The Phase-3 API foundation: **interfaces only, no implementations, no HTTP.** These contracts
define how the platform will talk to SAP Integration Suite once connectivity is implemented, so
every future module codes against a stable seam from day one.

## Contracts

| Interface | Backs | Verbs |
|---|---|---|
| `IIntegrationSuiteClient` | all providers (transport seam) | `get`, `post`, `delete` |
| `IMonitoringProvider` | Message/Live Monitoring, Dashboard | query/read MPLs, error details, status counts |
| `IJmsProvider` | JMS Queues, Retry Center | queue states, list/delete/purge messages |
| `IPayloadProvider` | Payload Viewer/Archive | list/read attachments |
| `ICertificateProvider` | Certificate Management | list certificates, expiry sweep |
| `IRuntimeProvider` | Live Monitoring, Dashboard | artifact statuses, restart |
| `IAlertProvider` | Alert Center, shell notifications | query/read alerts |
| `IValueMappingProvider` | Value Mapping | list schemes, read scheme (added Phase 4) |

`types.ts` declares the neutral domain shapes these contracts speak
(`MessageProcessingLog`, `QueueRuntimeInfo`, `CertificateInfo`, `AlertEvent`, `ValueMappingScheme`, …).

## Phase 4: mock implementations

`srv/src/sdk/providers/` now provides a concrete, mock-data implementation of every contract here
(plus `IValueMappingProvider`), selected via the SDK's mock engine (`srv/src/sdk/mock/`) so modules
can be developed against realistic data before real Integration Suite connectivity is wired. See
`srv/src/sdk/providers/README.md`.

## Phase 5: real implementations

Every contract above now also has a live, Integration-Suite-backed implementation
(`sdk/providers/Real*`), built on the Phase-4 HTTP/auth/destination/OData/REST/pipeline
infrastructure — same interfaces, same error boundary, same statelessness rule; only the data source
changed. `IntegrationSuiteSdkClient`'s `providerMode` option selects mock vs. real per deployment
(configuration-driven, per `config/connectivity.json` — see `docs/CONNECTIVITY_GUIDE.md`), never a
code change to a module or to these interfaces.

## Rules

1. **Dependency direction:** module services depend on these interfaces; implementations are
   injected (constructor parameter with a default), never imported concretely by domain code.
2. **Error boundary:** implementations throw `IntegrationSuiteError` (or another `AppError`) —
   raw HTTP/OData errors never cross this seam.
3. **Shape boundary:** implementations map upstream payloads into the `types.ts` shapes at the
   seam; no CPI schema appears above it.
4. **Context:** every call takes a `ProviderContext` (tenant id + correlation id) — providers are
   stateless and tenant-agnostic between calls.
5. **Statelessness:** providers fetch live; they never cache business data or persist anything.
