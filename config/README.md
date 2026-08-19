# Configuration

The **single external configuration surface** of the Integration Portal, organized as one typed
JSON file per domain (Phase-3 platform foundation). Loaded, validated and frozen at boot by the
backend `ConfigService` (`srv/src/config/ConfigService.ts`) — the only class that reads these
files. The frontend receives a safe projection via `GET /api/v1/administration/config`.

**Fail-fast:** a missing file or any schema violation aborts startup with a `ConfigurationError`
naming the file and property. The zod schemas in `srv/src/config/schemas/` are the authoritative
definition of validity; `npm test --workspace=srv` validates the shipped files against them.

**Local overrides:** every `<name>.json` may have a gitignored `<name>.local.json` next to it;
its top-level keys shallow-merge over the base file (development only).

**No secrets, no business data:** credentials live in the BTP Destination service (tenants
reference a `destinationName` only); monitoring data is always fetched live.

## Files and properties

### `application.json` — application identity
| Property | Type | Meaning |
|---|---|---|
| `id` | string | Stable technical identifier (matches the MTA ID). |
| `name` | string | Human-readable application name. |
| `version` | string (semver) | Version of this configuration set. |
| `description` | string | One-line purpose statement. |
| `vendor` | string | Owning organization. |
| `supportContact` | string | Support mailbox/channel. |
| `documentationUrl` | URL or `""` | Documentation entry point. |

### `environment.json` — deployment stage
| Property | Type | Meaning |
|---|---|---|
| `name` | string | Short stage id (`dev`, `qa2`, `prod-eu`, …) — free-form. |
| `label` | string | Stage label rendered in the shell header. |
| `kind` | `development` \| `testing` \| `production` | Behavioural kind; switches (CORS laxness, verbose errors) key off this. New kinds are added in `environment.schema.ts`. |

### `tenants.json` — Integration Suite tenants
Array `tenants[]`, at least one entry, ids unique, at least one enabled `default`:

| Property | Type | Meaning |
|---|---|---|
| `id` | string | Stable tenant id used in API calls. |
| `name` | string | Display name (tenant switcher). |
| `description` | string | Free-text purpose. |
| `destinationName` | string | BTP Destination that holds the credentials. |
| `baseUrl` | URL | Tenant API base URL (placeholder resolver only, until Destinations are wired). |
| `region` | string | BTP region (e.g. `us10-001`). |
| `environment` | string | Environment `name` the tenant belongs to. |
| `enabled` | boolean | Disabled tenants are hidden and rejected. |
| `displayColor` | `#RRGGBB` | Tenant accent colour in the UI. |
| `displayIcon` | `sap-icon://…` | Tenant icon in the UI. |
| `refreshProfile` | string | Refresh profile name (see `refresh.json`). |
| `default` | boolean | The tenant used when no id is given. |

### `queues.json` — JMS queue topology
Array `queues[]`, names unique:

| Property | Type | Meaning |
|---|---|---|
| `name` | string | Physical JMS queue name — never hardcoded anywhere else. |
| `displayName` | string | UI label. |
| `description` | string | Free-text purpose. |
| `deadLetterQueue` | string | Paired DLQ name. |
| `retryQueue` | string | Paired retry queue name. |
| `priority` | int ≥ 1 | Ordering weight in operational views (1 = highest). |
| `enabled` | boolean | Disabled queues are hidden from tooling. |
| `retryStrategy` | `immediate` \| `fixed-interval` \| `exponential-backoff` \| `manual` | Retry policy (powers the future Retry Center). |
| `maxRetries` | int ≥ 0 | Automatic retry ceiling (must be 0 for `manual`). |

### `frameworks.json` — processing-framework registry
Array `frameworks[]`; ids and priorities both unique. Backs framework detection
(`operations/engines/FrameworkDetectionEngine`) and the per-framework recovery strategies
(`operations/recovery/`). This is the **only** place a framework's iFlow signals or queue names are
declared — none are hardcoded in the engines.

| Property | Type | Meaning |
|---|---|---|
| `id` | `TPM_V2` \| `JMS_FRAMEWORK` \| `COMMON_IDOC_ROUTER` \| `IDOC_STATUS_SYNC` | Framework identity. `NON_FRAMEWORK`/`UNKNOWN` are detection *outcomes*, not configurable entries. |
| `label` | string | Operator-facing name (the "Processing Framework" column). |
| `enabled` | boolean | Disabled frameworks are skipped entirely; their messages fall through to `UNKNOWN`. |
| `priority` | int ≥ 1 | Detection evaluation order (1 = first). Duplicates are rejected so ordering is deterministic. |
| `detect.integrationFlowPatterns` | string[] (regex) | Matched against the message's own iFlow name. A name-shape match alone is `probable` confidence, never `confirmed`. |
| `detect.correlationFlowNames` | string[] | Exact iFlow names that must **all** appear in the correlation group. A full match is `confirmed`. |
| `detect.customHeaderNames` | string[] | Custom headers that must be present (full detection only). |
| `detect.customHeaderMatches` | `{ name, valuePattern }[]` | Header present **and** value matching (full detection only). |
| `topology.traversalOrder` | string[] | Ordered queue probe sequence when locating a message. First hit wins. |
| `topology.activeQueues` | string[] | Queues a message can be retried from directly. |
| `topology.deadLetterQueues` | string[] | Queues a message must be **moved out of** before retry. |
| `topology.dlqRecoveryMap` | map: DLQ → active queue | Where each DLQ's messages are moved back to. Every DLQ needs an entry and every target must be an `activeQueues` member — enforced at boot. |
| `queueResolution.headerName` | string | Custom header carrying a runtime-resolved queue (JMS Framework). |
| `queueResolution.headerValuePattern` | string (regex) | First capture group is the bare queue name. |
| `queueResolution.centralDeadLetterQueue` | string | Fixed DLQ those messages fall back to. |

A framework with no `detect` rules (Common IDoc Router, IDoc Status Sync today) is still detectable
through queue evidence during full detection — it just never matches during cheap, list-facing
detection. That is deliberate: an unmatched message is reported `UNKNOWN` with evidence, never guessed.

### `refresh.json` — polling cadence profiles
| Property | Type | Meaning |
|---|---|---|
| `defaultProfile` | string | Profile applied when none is named (must exist in `profiles`). |
| `profiles.<name>` | map: string → int ms (≥ 1000) | Interval per concern. Well-known keys: `dashboardMs`, `liveMonitoringMs`, `messageMonitoringMs`, `jmsQueueMs`, `certificatesMs`, `analyticsMs`, `alertCenterMs`. New keys need no schema change. |

### `features.json` — module enablement & feature flags
| Property | Type | Meaning |
|---|---|---|
| `modules.<moduleId>.enabled` | boolean | Whether the module appears in the sidebar/API. Keys match the frontend `ModuleId` union. |
| `flags.<name>` | boolean | Cross-cutting behaviour toggles (e.g. `enableWebSocketLiveFeed`). |

### `theme.json` — theming & branding
| Property | Type | Meaning |
|---|---|---|
| `defaultTheme` | string | UI5 theme applied at bootstrap. |
| `darkTheme` | string | Theme used for dark appearance. |
| `availableThemes` | string[] | Themes users may switch between (must contain both above). |
| `allowUserOverride` | boolean | Whether the theme switcher is offered. |
| `compactMode` | `auto` \| `compact` \| `cozy` | Content-density policy (`auto` = by device). |
| `accentColor` | `#RRGGBB` | Brand accent for custom surfaces. |
| `logo` | string | App-relative logo path (`""` = none). |
| `companyName` | string | Company name in branded chrome. |
| `applicationTitle` | string | Display title (branding; technical name lives in `application.json`). |

### `monitoring.json` — monitoring defaults
| Property | Type | Meaning |
|---|---|---|
| `defaultTimeWindowHours` | int 1–720 | Initial look-back window for monitoring filters. |
| `defaultStatusFilter` | string | Initial message-status filter. |
| `maxPageSize` | int 1–1000 | Hard ceiling for `$top` on list endpoints. |
| `defaultPageSize` | int ≥ 1 | Page size when the client sends no `$top`. |
| `liveFeedChannels.<key>` | string | Logical WebSocket channel names per live concern. |
| `slowProcessingThresholdMs` | int ≥ 1 | Processing time above which a message is flagged slow. |

### `logging.json` — logging framework
| Property | Type | Meaning |
|---|---|---|
| `level` | `trace`…`critical` | Backend minimum level (`LOG_LEVEL` env var overrides). |
| `includeCorrelationId` | boolean | Bind correlation ids to request loggers. |
| `client.shipLevel` | `trace`…`critical` | Browser level at/above which entries ship to the backend. |
| `client.flushIntervalMs` | int ≥ 1000 | Client log buffer flush cadence. |
| `client.maxBufferEntries` | int ≥ 1 | Buffer size forcing an early flush. |
| `audit.enabled` | boolean | Emit structured audit lines for sensitive actions. |

### `security.json` — transport security
| Property | Type | Meaning |
|---|---|---|
| `cors.allowedOrigins` | URL[] | Explicit CORS allow-list. Empty = same-origin (dev reflects any origin; deployed denies cross-origin). |
| `rateLimit.windowMs` | int ≥ 1000 | Fixed rate-limit window. |
| `rateLimit.maxRequests` | int ≥ 1 | Requests per user per window. |
| `requestBodyLimitKb` | int 1–51200 | Max accepted JSON body size. |
| `csrf.enabled` | boolean | CSRF token handshake active (approuter also enforces on deployed routes). |

### `connectivity.json` — Integration Suite SDK connectivity mode (Phase 5)
See [`docs/CONNECTIVITY_GUIDE.md`](../docs/CONNECTIVITY_GUIDE.md) for the full operator walkthrough.

| Property | Type | Meaning |
|---|---|---|
| `mode` | `mock` \| `real` | Selects whether `IntegrationSuiteSdkClient` serves mock data or live Integration Suite data. Default `mock`. |
| `destinationDiscovery` | `static` \| `btp` | How destinations are resolved when `mode` is `real`: `static` assembles them from `tenants.json` + `tenantAuth` below; `btp` looks each one up live in the bound SAP BTP Destination service (recommended for deployed environments). |
| `tenantAuth[]` | array | Per-tenant auth *strategy* (`tenantId`, `type: basic \| oauth-client-credentials`, `oauthTokenUrl?`, `oauthScope?`), consumed only under `static` discovery. Actual secrets are never stored here — see the environment variables below. |

## Environment variables (runtime overrides)
| Variable | Effect |
|---|---|
| `CONFIG_DIR` | Absolute path to this directory (default: found by upward search for `config/application.json`). |
| `LOG_LEVEL` | Overrides `logging.json` → `level`. |
| `PORT` | HTTP port (Cloud Foundry injects it; local default 4004). |
| `DESTINATION_SERVICE_URL` / `_TOKEN_URL` / `_CLIENT_ID` / `_CLIENT_SECRET` | The SDK's own credentials to call the SAP BTP Destination service, required together when `connectivity.json` → `destinationDiscovery` is `btp`. |
| `CPI_<TENANTID>_USERNAME` / `_PASSWORD` | Basic auth secret for a tenant under `static` discovery (tenant id upper-cased, non-alphanumerics → `_`). |
| `CPI_<TENANTID>_CLIENT_ID` / `_CLIENT_SECRET` | OAuth Client Credentials secret for a tenant under `static` discovery. |
