# `sdk/client/` — the SDK's public entry point

`IntegrationSuiteSdkClient` is the **only** class outside the SDK anything should construct or
depend on (architecture: Integration Suite Client, §4). It composes one sub-client per Integration
Suite capability area, wired to either `sdk/providers/Mock*` or `sdk/providers/Real*` depending on
`providerMode` (`"mock"` by default — Phase 4's behaviour, unchanged — or `"real"`, Phase 5):

| Sub-client | Mock mode | Real mode (Phase 5) |
|---|---|---|
| `monitoring` | `MockMonitoringProvider` | `RealMonitoringProvider` |
| `runtime` | `MockRuntimeProvider` | `RealRuntimeProvider` |
| `jms` | `MockJmsProvider` | `RealJmsProvider` — including `retryMessage`, provider-backed via the Cloud Integration JMS OData API's `RetryMessagingMessages` function import (originally excluded from Phase 5; adopted once the tenant `$metadata` and the published JMS OData API confirmed the real surface). |
| `payload` | `MockPayloadProvider` | `RealPayloadProvider` |
| `certificate` | `MockCertificateProvider` | `RealCertificateProvider` |
| `valueMapping` | `MockValueMappingProvider` | `RealValueMappingProvider` |
| `securityMaterial` | `MockCertificateProvider` (shared instance) | `RealCertificateProvider` (shared instance) — same certificate/keystore-subset scope note as mock mode. |
| `apiManagement` | `MockEngine` directly (`ApiFixtures`) | Unchanged — no Phase-3 provider contract exists for API Management; out of Phase 5's scope. |
| `alertNotification` | `MockAlertProvider` | `RealAlertProvider` when `real.alertNotification` is configured, otherwise falls back to `MockAlertProvider` (alerts may still come only from local sweeps). |
| `designTime` | `MockEngine` directly (`ApplicationFixtures`) | Unchanged — no Phase-3 provider contract exists for design-time browsing; out of Phase 5's scope. |

## Construction

```ts
// Mock mode (default) — identical to Phase 4:
const sdk = new IntegrationSuiteSdkClient({
  defaultTenantId: "primary",
  mockEngineConfig: { enabled: true, defaultScenario: "success" },
});

// Real mode — dependencies are constructed by the composition root
// (srv/src/config/sdkClientFactory.ts), never read from config by the SDK itself:
const sdkReal = new IntegrationSuiteSdkClient({
  defaultTenantId: "primary",
  mockEngineConfig: { enabled: true, defaultScenario: "success" },
  providerMode: "real",
  real: { destinationResolver, httpClient },
});

const page = await sdk.monitoring.queryMessageLogs({ status: "FAILED" }, { skip: 0, top: 50 });
```

Every sub-client method accepts an optional `ClientCallContext` (`{ tenantId?, correlationId? }`) to
override the client's configured default tenant or propagate an existing correlation id;
`resolveContext()` fills in the rest (a fresh `crypto.randomUUID()` correlation id by default).

`isMockModeEnabled()` reflects `providerMode !== "real"` — it no longer just mirrors the shared
`MockEngine`'s own enabled flag (which still backs `apiManagement`/`designTime` regardless of
mode).

## Why a composition root, not the SDK itself, reads configuration

Neither mode has this class read `config/*.json` — `providerMode: "mock"` needs only
`mockEngineConfig`; `providerMode: "real"` needs only a finished `IDestinationResolver` and
`IHttpClient`, built by whatever composition root the embedding application uses
(`srv/src/config/sdkClientFactory.ts` here). This is what keeps the SDK reusable in other Node.js
projects with a different configuration format — the exact reasoning `AuthProviderFactory`'s own doc
comment already gives for auth configuration, applied here to the whole client.
