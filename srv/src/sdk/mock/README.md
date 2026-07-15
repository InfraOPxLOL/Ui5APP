# `sdk/mock/` — mock engine

Lets every module be developed and demoed against realistic data with zero Integration Suite
connectivity (architecture: Mock Engine, §11).

## `MockEngine`

Every mock provider method routes its data through `MockEngine.resolve()` instead of returning
fixtures directly, so scenario selection is centralized and consistent across every domain:

| Scenario | Behaviour |
|---|---|
| `success` | A normal, realistic result (`generateSuccess`). |
| `empty` | A valid but empty result — tests empty-state UI (`generateEmpty`, defaults to `generateSuccess`). |
| `slow` | The success result, delayed by `slowDelayMs` (default 3000) — tests loading/busy states. |
| `largePayload` | A much larger dataset (`generateLarge`) — tests virtualization/performance. |
| `multiPage` | Same generator as `largePayload`, sized so list operations naturally require several pages. |
| `timeout` | Throws `TimeoutError`. |
| `error` | Throws `IntegrationSuiteError` (tenant-tagged, status 500). |
| `failure` | Throws `NetworkError` (no response at all). |

Selection is **configuration-driven**: a `defaultScenario` plus optional per-operation
`scenarioOverrides` keyed by operation key (e.g. `"monitoring.queryMessageLogs": "slow"`) — the SDK
itself never reads `config/*.json`; the composition root translates whatever configuration source it
uses into a `MockEngineConfig`.

## Fixtures (`mock/fixtures/`)

One generator module per domain (`MessageFixtures`, `RuntimeArtifactFixtures`, `QueueFixtures`,
`CertificateFixtures`, `AlertFixtures`, `ValueMappingFixtures`, `PayloadFixtures`, plus `ApiFixtures`
and `ApplicationFixtures` for the two sub-clients with no Phase-3 provider contract). Each is
`generateX(count, seed?)`, deterministic given the same seed via `SeededRandom` (a tiny inline
mulberry32 PRNG — no external dependency) — so tests asserting against generated data are
reproducible, unlike plain `Math.random()`.
