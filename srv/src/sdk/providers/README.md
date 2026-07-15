# `sdk/providers/` — mock provider implementations

One concrete, mock-data-backed class per `core/providers/I*Provider` contract (architecture:
Provider Framework, §10), completing the seven interfaces (six from Phase 3, plus
`IValueMappingProvider` added alongside this SDK).

| Provider contract | Mock implementation | Notes |
|---|---|---|
| `IMonitoringProvider` | `MockMonitoringProvider` | Filters/paginates a scenario-generated dataset in memory; aggregates status counts. |
| `IJmsProvider` | `MockJmsProvider` | Queue states, message listing, delete, purge. |
| `IPayloadProvider` | `MockPayloadProvider` | Attachment listing (metadata only) and content retrieval. |
| `ICertificateProvider` | `MockCertificateProvider` | Full listing and the expiry-sweep query, sorted soonest-first. |
| `IRuntimeProvider` | `MockRuntimeProvider` | Artifact listing/read/restart. |
| `IAlertProvider` | `MockAlertProvider` | Severity-filtered, paginated alert querying. |
| `IValueMappingProvider` | `MockValueMappingProvider` | Scheme listing and lookup by name. |
| `ISplunkProvider` | `MockSplunkProvider` | Payload fallback for messages with no MPL attachment — generates a realistic Splunk HEC event (`sdk/mock/fixtures/SplunkFixtures.ts`) and decodes its gzip+base64 request/response payload bodies via `SplunkPayloadCodec.decodeGzipBase64Text`. Mock-only: real Splunk search-API querying isn't reachable from this trial tenant, so `IntegrationSuiteSdkClient` wires this unconditionally regardless of `providerMode` (see its own doc comment) — there is no `RealSplunkProvider` yet, the same situational precedent `IValueMappingProvider` was in before its real sibling shipped. |
| `IPartnerDirectoryProvider` | `MockPartnerDirectoryProvider` | Read/write access to Partner Directory `StringParameters` (the CoE Framework's configuration store). Unlike the read-only mocks this one is **stateful** (an in-memory store seeded with `.SYS_JMS_FRAMEWORK` defaults) so the create/update path is exercisable in mock mode and tests. Its real sibling `RealPartnerDirectoryProvider` (below) is live and verified against the trial tenant. |

## Pattern every mock provider follows

Each method calls `mockEngine.resolve({ operationKey, tenantId, generateSuccess, generateEmpty?, generateLarge? })`
to obtain a scenario-appropriate dataset, then applies any filtering/pagination/aggregation over it
in plain TypeScript — exercising the exact same client-facing contract a real, CPI-backed
implementation will, without any upstream connectivity. No provider method contains business logic
beyond that in-memory shaping.

## Real implementations (Phase 5)

Every mock provider above now has a live sibling, built on `sdk/pipeline` (destination resolution +
error normalization) and `sdk/odata`/`sdk/rest` (transport) instead of `MockEngine`:

| Provider contract | Real implementation | Backed by |
|---|---|---|
| `IMonitoringProvider` | `RealMonitoringProvider` | OData v1 Monitoring API, `MessageProcessingLogs` (+ `ErrorInformation` navigation). Stable, well-documented CPI entity set. |
| `IRuntimeProvider` | `RealRuntimeProvider` | OData v1 Monitoring API, `IntegrationRuntimeArtifacts` + the `DeployIntegrationDesigntimeArtifact` deploy action for `restartArtifact` (CPI has no separate "restart" verb — redeploying the current version is the documented equivalent). |
| `IPayloadProvider` | `RealPayloadProvider` | `MessageProcessingLogs('id')/Attachments` navigation + `MessageProcessingLogAttachments('id')/$value` binary download (base64-encoded into `PayloadEnvelope.content`). |
| `ICertificateProvider` | `RealCertificateProvider` | `KeystoreEntries` OData entity set. |
| `IJmsProvider` | `RealJmsProvider` | The Cloud Integration JMS OData API, live-verified against the tenant `$metadata`: `Queues` for discovery/runtime state (`NumbOfMsgs`/`FillGrade`/`Active`; Int64 fields arrive as JSON strings), `MessagingQueues('q')/MessagingMessages` for message listing (its own `pageSize` parameter, 100–10,000 — `$filter`/`$top`/`$skip` are not supported on this surface), composite-key `MessagingMessages(jmsMessageId=…,queueName=…)` for DELETE, and the `RetryMessagingMessages` POST function import for `retryMessage`. Names stay constructor-injected (`JmsProviderEndpoints`) — the same tenant also *declares* a legacy `JmsQueues` entity set that answers `501 Not Implemented`, so metadata presence alone is not trusted. No per-queue consumer count and no per-message size exist on this surface; both map to `undefined` (unknown), never fabricated. |
| `IValueMappingProvider` | `RealValueMappingProvider` | Configurable entity-set name (`ValueMappingProviderEndpoints`, default `ValueMappingDesigntimeArtifacts`). Returns accurate scheme `name`/`description`; `agencies` is always empty — the public API exposes design-time metadata, not per-entry mapping content, without downloading and parsing the deployed artifact package (documented limitation, not a bug). |
| `IAlertProvider` | `RealAlertProvider` | The SAP Alert Notification Service's own consumer REST API — a distinct BTP service instance with its own base URL and OAuth client (`AlertNotificationServiceConfig`), injected directly rather than resolved through `IDestinationResolver` (an ANS instance isn't "a tenant" in this SDK's destination vocabulary). Optional: when not configured, alerts remain `MockAlertProvider`-backed even in `"real"` mode. |
| `IPartnerDirectoryProvider` | `RealPartnerDirectoryProvider` | Partner Directory `StringParameters` OData v2 entity set (key `(Pid, Id)`) — the first SDK surface performing tenant *writes* beyond JMS message actions. Reads via `getEntity`; writes (POST create / PUT update) perform a `X-CSRF-Token: Fetch` handshake against the service root first, replaying the token + session cookie on the modifying request. **Verified live against the trial tenant** (create/read/update all succeed). |

Every `Real*Provider` depends only on `RequestPipeline` (for destination resolution + error
normalization) and an `IHttpClient` — never on `fetch`, `axios`, or a config file. Shared OData v2
date parsing (`/Date(ms)/` → ISO 8601) and key-literal encoding live in `RealProviderSupport.ts` to
avoid duplicating them across providers.

Selecting mock vs. real per sub-client is `IntegrationSuiteSdkClient`'s job
(`providerMode: "mock" | "real"`) — nothing in `sdk/client/*Client` (the facades) changes either way.
