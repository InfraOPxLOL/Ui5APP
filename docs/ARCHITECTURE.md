# IS Ops Cockpit — Platform Architecture

> Working title: **IS Ops Cockpit** ("Splunk for SAP Integration Suite"). Rename freely — used
> throughout this doc as a placeholder so every path/namespace example has a concrete anchor.

## 0. Product Vision & Non-Goals

**Vision:** an independent, enterprise-grade operations and observability platform for SAP
Integration Suite (Cloud Integration, API Management, Event Mesh). It consumes Integration
Suite's own OData/REST/JMS/Alert Notification APIs as a *live data source*, and is a distinct
product with its own UX and its own RBAC-on-top-of-XSUAA — built for the monitoring and triage
workflows Integration Suite intentionally leaves out (cross-tenant views, advanced
filtering/search, shareable filtered views, live alert visualization, guided replay workflows).

**Statelessness is a hard product constraint, not just an implementation detail:** the backend
holds no business data of its own. Every screen reflects what Integration Suite reports *right
now* (or over a time window CPI itself can answer live). This rules out a class of features by
design — no payload archive beyond CPI's own retention, no locally stored audit trail, no
custom-stored alert rules, no retry-history table. Where the vision below mentions "saved views"
or "shareable" state, that is realized entirely via URL query parameters (§15), never server-side
storage.

**Non-goals:**
- Not a replacement for Integration Suite's Monitor UI — it is a superset UX layered on top.
- Not a design-time tool — no iFlow authoring, no mapping design.
- Not tenant-agnostic middleware — v1 targets one or more CPI tenants the customer owns, connected
  via BTP Destinations, not a multi-customer SaaS control plane (that's a possible v2).

**Product principle:** every screen is a *workspace*, not a form. Filter bars are persistent and
shareable via URL. Every list row expands into a detail popover with enough context that the user
rarely needs to pivot into the native Integration Suite UI. Empty states never happen by
accident — if a panel would be empty, it's because there's genuinely nothing there, and the empty
state explains why and what to do next.

---

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  SAP UI5 (TypeScript) SPA — Shell + lazy-loaded Module Components        │
└───────────────────────────────┬───────────────────────────────────────--┘
                                 │ HTTPS (same-origin via approuter)
┌────────────────────────────────▼──────────────────────────────────────--┐
│  App Router (@sap/approuter)                                            │
│  - Serves UI5 app from HTML5 Application Repository                     │
│  - Routes /api/* to the backend microservice                            │
│  - Enforces XSUAA session (OAuth2/OIDC), CSRF                           │
└────────────────────────────────┬──────────────────────────────────────--┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────--┐
│  Backend: Node.js + Express (Cloud Foundry app) — STATELESS                │
│  - Modular monolith: one deployable, no module owns persistent storage  │
│    (see §12 for when/why a module might later be split out)             │
│  - Module routers, services, CPI clients — every request fetches live   │
│  - WebSocket server (live monitoring push, in-memory connections only)  │
│  - config.ts loads static config.json (tenant URLs, queue/DLQ mappings, │
│    refresh intervals, feature flags) — see §11                          │
└──────┬───────────────┬───────────────┬──────────────────────────────--──┘
       │               │               │
       ▼               ▼               ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐
│ Destination │ │ XSUAA        │ │ SAP Alert            │
│ service     │ │ (OAuth2/     │ │ Notification Service │
│ (CPI tenant │ │  scopes)     │ │ (inbound webhooks,   │
│ creds)      │ │              │ │  fanned out live)     │
└──────┬──────┘ └──────────────┘ └──────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────────────┐
│  SAP Integration Suite (customer tenant(s))                           │
│  Cloud Integration OData/REST (MPL, JMS, deploy status) · API Mgmt    │
│  analytics API · Security Material APIs · Value Mapping API           │
└───────────────────────────────────────────────────────────────────────┘
```

**Core architectural decision (non-negotiable):** the UI5 app **never** calls Integration Suite
directly. Every call goes UI5 → own backend → Integration Suite. Reasons:
1. CPI credentials (Destination-bound OAuth2/Basic) never reach the browser.
2. The backend can fan out/aggregate multiple CPI calls (e.g., MPL + JMS queue depth + cert
   expiry) into one shaped response the UI needs — fewer round trips, and CPI API shape changes
   don't ripple into the UI.
3. Response caching, rate-limiting, and audit logging of "who queried/replayed what" all need a
   server-side chokepoint anyway.

**Deployment target:** SAP BTP, Cloud Foundry. MTA-packaged: approuter + UI5 app (HTML5 Repo) +
Node backend + XSUAA + Destination, deployed from Business Application Studio. **No persistence
service is provisioned** — the backend is stateless by design (see below), so there is no HDI
container, no database binding, nothing to back up or migrate. This is a deliberate simplification:
the whole platform can be redeployed or scaled horizontally with zero data-migration concerns,
because there is no data to migrate.

---

## 2. Complete Folder Hierarchy

### 2.1 Frontend (`app/webapp`)

```
app/
  webapp/
    Component.ts
    manifest.json
    index.html
    models/
      models.ts                    # device model, app-config model factory
    core/                          # framework-level only — zero business logic
      base/
        BaseController.ts
        BaseComponent.ts
        BaseService.ts
        BaseDialogController.ts
      formatters/
        DateTimeFormatter.ts
        StatusFormatter.ts
        DurationFormatter.ts
        SizeFormatter.ts
        index.ts                   # single barrel import point
      utils/
        FilterBuilder.ts           # OData $filter builder, shared by all modules
        ODataV4Helper.ts
        ExportHelper.ts            # CSV/XLSX export, used by every table
        DeepLinkHelper.ts          # URL <-> filter-state (de)serialization
      constants/
        RouteNames.ts
        MessageStatus.ts
        QueueStatus.ts
      events/
        AppEventBus.ts             # typed wrapper over sap.ui.core.EventBus
      errors/
        AppError.ts
        ErrorHandler.ts
      logging/
        ClientLogger.ts
      services/
        http/
          ApiClient.ts             # single fetch/XHR wrapper: correlation-id, CSRF, retries
          WebSocketClient.ts
        auth/
          SessionService.ts
        config/
          ConfigService.ts
        dialog/
          DialogService.ts         # open(config) -> reusable popovers/dialogs
        table/
          TableConfigService.ts    # resolves column configs -> generic table control
    library/                       # reusable custom controls & fragments, module-agnostic
      controls/
        StatusIndicator.ts
        SeverityBadge.ts
        ConfigurableTable.ts       # config-driven wrapper over sap.ui.table.Table
      fragments/
        ConfirmDialog.fragment.xml
        DetailPopover.fragment.xml
        ExportDialog.fragment.xml
        FilterBar.fragment.xml
    shell/                         # global chrome — nav, header, search, notification bell
      view/Shell.view.xml
      controller/Shell.controller.ts
      fragments/NotificationPanel.fragment.xml
      model/ModuleRegistry.ts      # declarative list of enabled modules -> nav entries
    modules/
      dashboard/
      message-monitoring/
        view/
        controller/
        model/
        service/MessageMonitoringService.ts
        config/columns.ts          # column config consumed by ConfigurableTable
        formatters/
        i18n/
      live-monitoring/
        websocket/LiveMonitorSocket.ts
        ...
      jms-queue/
      message-replay/
      api-monitoring/
      certificate-management/
      security-materials/
      value-mapping/
      integration-advisor/
      analytics/
      audit-view/                  # live-queries the log service; no local audit storage
      alert-notification/          # live WS feed of ANS events; no stored rules/history
      role-view/                   # read-only: current user's effective XSUAA scopes
      administration/              # destinations, module enablement, tenant settings
    i18n/
      i18n.properties              # shell-level strings ONLY
    css/
      shell.css
    test/                          # QUnit unit + OPA5 integration tests (SAP-standard location)
      unit/
      integration/
```

**Rule:** a module folder is self-contained (view, controller, model, service, i18n, formatters).
Nothing outside `core/` and `library/` is imported by more than one module. If two modules need
the same logic, it moves to `core/` or `library/` — it does not get copy-pasted.

### 2.2 Backend (`srv/`)

```
srv/
  server.ts                        # http + ws bootstrap
  app.ts                           # express app assembly, middleware order
  config/
    env.ts                         # typed, validated env/VCAP loader (fail fast on boot)
    destinations.ts                # destination resolution wrapper
    xsuaa.ts
  core/
    middleware/
      auth.middleware.ts
      errorHandler.middleware.ts   # single terminal error middleware
      requestLogger.middleware.ts
      correlationId.middleware.ts
      rateLimiter.middleware.ts
      validateRequest.middleware.ts # zod-schema-driven
    errors/
      AppError.ts                  # base class
      HttpError.ts                 # 4xx taxonomy
      UpstreamError.ts             # wraps/normalizes CPI error responses
    logging/
      logger.ts                    # pino, structured, correlation-id aware
    http/
      IntegrationSuiteClient.ts    # base authenticated client (OAuth2/Basic via Destination)
      RestClient.ts
    websocket/
      wsServer.ts
      wsAuth.ts
    memo/
      requestMemo.ts               # in-flight de-dupe ONLY (same request, concurrent callers
                                    # collapse to one upstream call) — process memory, no TTL
                                    # cache of business data; nothing here survives a request
    jobs/
      scheduler.ts                 # cron-style registration, in-memory timers only
  modules/
    message-monitoring/
      routes.ts
      controller.ts
      service.ts
      dto.ts
      validators.ts
    live-monitoring/
      routes.ts
      controller.ts
      service.ts
      socketHandlers.ts
    jms-queue/
    message-replay/
    api-monitoring/
    certificate-management/
      jobs/certExpirySweep.ts      # polls CPI Keystore API on an interval, pushes over WS —
                                    # does not persist expiry history, only current state
    security-materials/
    value-mapping/
    integration-advisor/
    analytics/                     # aggregates live queries only; trend range is bounded by
                                    # whatever retention CPI's own APIs expose
    audit-view/
      service.ts                   # queries the bound log service (Cloud Logging /
                                    # Application Logging) for this app's own audit-tagged log
                                    # lines — reuses the logging pipeline, stores nothing itself
    alert-notification/
      ansWebhook.controller.ts     # inbound SAP ANS callbacks, fanned out live over WebSocket —
                                    # no persisted rules/history; thresholds come from config.json
    role-view/
      service.ts                   # reads the caller's effective XSUAA scopes/role collections;
                                    # does not store or assign roles (that stays in BTP cockpit/
                                    # XSUAA admin, out of this app's scope)
    administration/
  routes/
    index.ts                       # mounts every module router under /api/v1/<module-kebab>
  test/
    unit/
    integration/
```

### 2.3 Deployment

```
mta.yaml
xs-security.json                   # XSUAA scopes/role templates, see §14
config/
  config.json                      # the ONLY persisted "state" — static, deployed with the app
approuter/
  xs-app.json
  package.json
```

No `db/` folder, no HDI container, no database service binding anywhere in `mta.yaml` — there is
nothing to provision beyond approuter, the Node app, XSUAA, and Destination.

---

## 3. Module Hierarchy

| Module | Phase | Frontend | Backend | Key upstream APIs | State it holds |
|---|---|---|---|---|---|
| Shell / Dashboard | 1 | ✅ | ✅ (aggregation endpoint) | MPL summary, JMS summary, ANS alert count | none — live fan-out |
| Message Monitoring | 1 | ✅ | ✅ | CPI MessageProcessingLogs OData | none |
| Live Monitoring | 1 | ✅ | ✅ (WebSocket) | CPI runtime status, polling bridge | none — WS connections only, in-memory |
| JMS Queue Management | 1 | ✅ | ✅ | CPI JMS Resources API | none |
| Message Replay | 1 | ✅ | ✅ | CPI MPL resend API | none — calls CPI's resend live, no retry-history table |
| Alert Notification | 1 | ✅ | ✅ (webhook → live WS fan-out) | SAP Alert Notification Service | none — thresholds live in config.json, not stored rules |
| Audit View | 1 | ✅ | ✅ | queries bound log service | none — reuses the logging pipeline (§10), no separate storage |
| Role View | 1 | ✅ | ✅ (read-only) | XSUAA scope introspection | none — reflects XSUAA's own role collections |
| Administration | 1 | ✅ | ✅ | Destination service, config.json | none — edits are to config, redeployed/reloaded, not DB writes |
| Certificate Management | 2 | ✅ | ✅ | CPI Keystore API | none — current state only, no expiry-history trend beyond what CPI reports |
| Security Materials | 2 | ✅ | ✅ | CPI Security Material API | none |
| API Monitoring | 2 | ✅ | ✅ | API Management analytics API | none |
| Value Mapping | 3 | ✅ | ✅ | CPI Value Mapping API | none |
| Integration Advisor | 3 | ✅ | ✅ | Integration Advisor API | none |
| Analytics | 3 | ✅ | ✅ | aggregates all of the above | none — trend range bounded by CPI's own retention |

Phase 1 = MVP. Note **Payload Archive is deliberately not in this list** — long-retention payload
storage is persistence by definition and is out of scope for a stateless v1 (see §16 if that
changes later). This ordering exists so the **module registration contract** (§12) gets exercised
by 9 real modules before anyone builds module #10 — the pattern must prove itself early, not get
retrofitted later.

---

## 4. UI Hierarchy

```
Shell (nav container, header, search, notification bell, tenant switcher)
 └─ Module Component (lazy-loaded via componentUsages, one per row in §3)
     └─ Views (XML, one per screen: List, Detail, Settings)
         └─ Fragments (reusable within module: filter panel, edit form)
             └─ Library Controls (ConfigurableTable, StatusIndicator, SeverityBadge)
                 └─ Core Formatters (pure functions, no UI5 dependency beyond types)
```

**Navigation model:** shell owns a single `sap.m.routing.Router` at the top level; each module is
a routing **target** that loads a `sap.ui.core.ComponentContainer` via `componentUsages`, not a
manually-managed `UIComponent.create()`. Deep links are `#/module-kebab/view?filters=...` — filter
state is always in the URL (see DeepLinkHelper, §2.1), so every saved view is just a bookmarked URL.

**Reusable popup strategy:** modules never author a one-off Dialog controller. They call
`DialogService.open({ fragmentName, model, buttons })`. The one exception is a module-specific
*form* dialog with real business logic (e.g., "create alert rule") — that gets its own fragment +
controller inside the module, but still opened through `DialogService` so lifecycle (busy state,
escape-to-close, focus return) is identical everywhere.

**Reusable table strategy:** modules do not hand-write `<Table>` XML with column-per-line
duplication. Each module defines a `config/columns.ts` (field, i18n key, type, sortable,
filterable, cell formatter) and passes it to the shared `ConfigurableTable` control. Adding a
column to Message Monitoring is a one-line config change, not a template edit — this is the single
biggest lever for "no duplicate logic" at 100k+ LOC scale, since tables are the majority of screens
in a monitoring product.

---

## 5. Service Hierarchy

**Frontend service layer** (`modules/*/service/*Service.ts`): the *only* code allowed to call
`ApiClient`. Controllers call exactly one service method per user action; they never construct
URLs, never touch fetch/XHR, never parse OData response envelopes directly.

**Backend service layer** (`modules/*/service.ts`): the *only* code allowed to call
`IntegrationSuiteClient`/`RestClient`. Controllers (Express) are thin — parse request, call
service, shape response, done. All CPI-specific quirks (odd status codes, XML edge cases,
pagination tokens) are absorbed here so nothing above this layer ever sees a raw CPI payload shape.

```
UI5 Controller → Frontend Service → ApiClient → [approuter] → Express Controller
    → Backend Service → IntegrationSuiteClient → Destination → CPI OData/REST
```

Every module's frontend Service and backend Service are 1:1 named
(`MessageMonitoringService.ts` on both sides) — searching the codebase for a module's data logic
means opening exactly two files.

---

## 6. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| UI5 namespace | reverse-domain, lowercase | `com.middlewareops.integrationportal` |
| Module namespace | `<root>.modules.<module>` | `com.middlewareops.integrationportal.modules.jmsQueue` |
| TS classes/controllers/components | PascalCase, suffix by role | `MessageMonitoring.controller.ts` |
| Folders (frontend & backend) | kebab-case | `message-monitoring/`, `jms-queue/` |
| Constants | SCREAMING_SNAKE_CASE | `MESSAGE_STATUS.FAILED` |
| i18n keys | `<moduleAbbrev>.<area>.<key>`, camelCase | `jms.action.purgeQueue`, `msgMon.title.list` |
| REST routes | `/api/v1/<module-kebab>/<resource>` | `/api/v1/jms-queue/queues/{id}/messages` |
| Git branches | `feature/<module>-<short-desc>`, `fix/...` | `feature/jms-queue-purge-action` |
| Commits | Conventional Commits, module-scoped | `feat(jms-queue): add queue purge action` |

---

## 7. Coding Standards

- **TypeScript strict mode**, org-wide `tsconfig.base.json`. `any` is permitted only at the exact
  boundary where a raw CPI/OData response enters the system, and must be narrowed to a typed DTO
  within the same file.
- **ESLint + Prettier**, enforced by pre-commit hook (husky + lint-staged) — not just CI. A commit
  with lint errors never lands.
- **Controllers contain zero business logic.** A controller method is: read event → call one
  service method → bind result to view model / open dialog. If a controller method exceeds ~15
  lines, logic almost certainly belongs in a service.
- **One class per file**, filename matches export name.
- **Barrel `index.ts`** per folder for import ergonomics; deep-imports across module boundaries
  are an ESLint error (enforced via `eslint-plugin-boundaries` or similar) — a module can only
  import from `core/`, `library/`, and itself, never reach into another module's internals.
- **Unit tests colocated conceptually, stored in `test/unit` mirroring source paths**; every
  Service (frontend and backend) has a test file. Controllers are tested via QUnit/OPA5
  integration tests, not unit tests, since their job is orchestration.

---

## 8. Reusable Components Strategy

Single inventory, owned by `library/` and `core/`, versioned as if it were an internal package
(even if physically colocated, treat its public surface like an API — breaking changes require
updating every module in the same PR):

- `ConfigurableTable` — config-driven table (§4).
- `DialogService` + `ConfirmDialog` / `DetailPopover` / `ExportDialog` fragments (§4).
- `FilterBar` fragment + `FilterBuilder` util — every module's filter panel is built from the same
  primitive filter-field types (status enum, date range, free-text, tenant picker).
- `StatusIndicator` / `SeverityBadge` controls — every module's "failed/completed/retry" or
  "critical/warning/info" rendering goes through these two controls, never ad-hoc `ObjectStatus`
  markup per view.
- Formatter library (`core/formatters`) — date/time, duration, byte-size, truncated-payload
  preview. Never inline a formatter function in a controller or view.

---

## 9. Error Handling Strategy

**Frontend:** `AppError` hierarchy (`ValidationError`, `NetworkError`, `AuthError`,
`BackendError`), all extending a common base carrying `correlationId`. A single `ErrorHandler`
service is wired once at shell bootstrap, hooked into `ApiClient`'s rejection path and into a
global unhandled-rejection listener. Severity determines presentation:
`ValidationError` → inline `MessageStrip`; `NetworkError`/`BackendError` → `MessageToast` +
non-blocking retry affordance; `AuthError` → redirect to re-auth. Every surfaced error shows its
`correlationId` so a user can hand it to support.

**Backend:** every async route handler is wrapped (`catchAsync` utility) so nothing throws past
Express's control flow uncaught. One terminal `errorHandler.middleware.ts` normalizes all errors
into `{ code, message, correlationId, details? }`. Upstream CPI failures are never passed through
raw — `UpstreamError` maps CPI's error shapes (which vary by API) into this platform's own stable
error taxonomy, so the frontend's `ErrorHandler` never needs to know CPI exists.

---

## 10. Logging Strategy

- **Correlation ID** generated at the approuter/edge, propagated through every downstream call —
  including as a custom outbound header on calls *to* CPI, so a single ID can trace a request
  across both systems' logs.
- **Backend:** structured JSON logs (pino), one line per request minimum (method, route, status,
  duration, correlationId, user), shipped to the bound SAP Cloud Logging / Application Logging
  service. Log level configurable per environment via `ConfigService`, not hardcoded.
- **Frontend:** `ClientLogger` batches warnings/errors client-side and POSTs them to
  `/api/v1/client-logs`, tagged with correlationId, module, and user — so frontend exceptions are
  searchable in the same backend log stream, not stranded in browser consoles.
- **Audit trail is a tagged subset of this same log stream**, not a separate store: every
  sensitive action (replay, purge, config change) logs a structured line with `audit: true`,
  actor, action, target, and correlationId. The Audit View module (§3) queries the bound log
  service (SAP Cloud Logging / Application Logging) for `audit: true` lines — it is a *view*, not
  a database. Retention is whatever the bound log service is configured to keep; this platform
  does not extend that retention itself, consistent with the stateless-backend constraint.

---

## 11. Configuration Strategy

**Single external config surface**, exactly as specified: one `config.json` (typed and validated
through `config.ts`) is the sole source of everything that isn't fetched live from Integration
Suite:

- Integration Suite tenant URL(s), per environment
- Destination names (which Destination to resolve for which tenant)
- Queue / DLQ / retry-queue mappings (static routing knowledge — *not* retry history)
- Refresh intervals (polling cadence for dashboard tiles, live monitoring)
- UI feature flags, default filters, theme, environment label

`config.ts` loads and validates `config.json` once at boot and fails fast on a missing/malformed
field — same fail-fast principle as before, just against one file instead of scattered env
lookups.

**One flagged deviation from "everything in config.json" — OAuth credentials.** The requested
config surface lists "OAuth credentials" as a config.json field. Recommend keeping the credential
*value* out of that file even though the *reference* to it lives there, i.e. `config.json` holds
`destinationName: "ISOPSCOCKPIT_CPI_PROD"`, and the actual client secret/Basic-Auth password is
resolved at runtime from the BTP **Destination service** (or, if you deploy without Destination
service, from an environment variable injected via `VCAP_SERVICES`/user-provided service) — never
committed to a JSON file that lives in the repo/build artifact. This keeps the "one config
surface, no database" simplicity you asked for while avoiding plaintext secrets in a versioned
file. If you'd rather have credentials directly in `config.json` (e.g. for a local/dev-only
convenience config that's gitignored), that's a reasonable exception for local development — just
not for anything that reaches a deployed BTP landscape. Flagging this so it's a decision, not a
default.

- **Module enablement** is itself a `config.json` field: an array/map of which modules in §3 are
  turned on for this deployment — new customers can start with Phase-1-only and light up modules
  later by editing config, no code change, no redeploy of anything but the config binding.
- **Feature flags** for in-progress features live in the same `config.json`, not scattered
  `if (env === 'dev')` checks in code.

---

## 12. Future Extensibility Strategy

Adding a module means: one new `webapp/modules/<name>` folder, one new `srv/modules/<name>`
folder, one line in each `ModuleRegistry`, and a scope entry in `xs-security.json`. Nothing in
`shell/` or `core/` should require editing to add a module — if it does, that's a signal the
module contract is leaking, and the fix is to strengthen the registry contract, not to special-case
the shell.

**Modular monolith now, selective extraction later:** start as one Express deployable and one UI5
shell app. The trigger to actually split a module into its own microservice/deployable is
operational, not architectural purity — e.g., Live Monitoring's WebSocket load or Payload
Archive's storage/egress profile scaling independently of the rest. Because module boundaries are
already enforced at the code level (§7's import-boundary lint rule), extraction later is a
deployment change, not a rewrite.

**Versioning:** REST routes are prefixed `/api/v1/...` from day one specifically so a breaking
change to one module's API can ship as `/api/v2/<that-module>` without forcing every other module
to bump in lockstep.

---

## 13. Performance Strategy

- All monitoring lists use server-side pagination + `growing` binding — full result sets (which
  can be tens of thousands of MPL entries) are never loaded client-side.
- OData `$batch` for any screen that needs multiple entity sets (e.g., dashboard tiles) — one
  round trip, not N.
- **No cross-request caching layer** — consistent with the stateless-backend constraint, every
  request fetches live from Integration Suite. The only exception is in-flight de-duplication
  (`core/memo/requestMemo.ts`): if five browser tabs hit the same dashboard aggregation endpoint
  in the same instant, they collapse to one upstream CPI call — this is concurrency control, not a
  data cache, and nothing survives past that single request's lifetime. Perceived "refresh"
  performance instead comes from tuned polling intervals (`config.json`) and `$batch`, not from
  serving stale data faster.
- One shared WebSocket connection per session (`LiveMonitorSocket` singleton) — views subscribe/
  unsubscribe to channels on it, they don't each open their own socket.
- Module components are lazy-loaded (code-split): the shell's initial bundle is nav chrome only;
  a module's JS doesn't download until its route is hit.
- `ConfigurableTable` defaults to virtualized rendering for any dataset over a configurable
  row-count threshold.

---

## 14. Security Strategy

- **XSUAA scopes**, two axes: platform role (`Administrator` / `Operator` / `Viewer`) and
  module-sensitive-action scope (e.g. `$XSAPPNAME.MessageReplay.Execute`,
  `$XSAPPNAME.JmsQueue.Purge`) — so an Operator can view everything but replay/purge/delete
  require an explicit additional scope, independent of the coarse role.
- CPI credentials never leave the backend — resolved per-request from the Destination service,
  never cached in a way that survives past the request lifecycle in a readable form.
- CSRF token flow enforced on every state-changing Express route (standard approuter/XSUAA
  pattern).
- Request validation at the API boundary via schema (zod) for every route accepting user input —
  filters, replay payloads, alert-rule definitions — rejected before reaching a service.
- Every sensitive action (replay, purge, config change) emits a structured `audit: true` log line
  (actor, timestamp, correlationId, target, before/after where applicable) through the same
  logging pipeline as §10 — queryable via the Audit View module, stored nowhere but the bound log
  service, independent of whatever CPI logs natively.
- Role assignment itself is **not** a feature of this app (no persistence to hold it) — role
  collections are managed in BTP cockpit / XSUAA as today; Role View only reflects the caller's
  resolved scopes so the UI can gate sensitive actions client-side (in addition to the backend
  re-checking the same scopes server-side on every state-changing request — never trust the
  client-side gate alone).

---

## 15. State Management Strategy

- **One JSONModel per module**, owned by that module's Component — no single giant global model.
  Modules are not allowed to read or write another module's model directly.
- **Shell-level model** holds only truly global state: current user, active tenant/environment,
  theme, global unread-notification count.
- **Cross-module communication** happens only through `AppEventBus` (typed channels/event names
  declared centrally, e.g. `alerts:newCritical`, `queue:purged`) — a module reacts to an event, it
  never imports another module's controller/model to poke it directly.
- **URL is the source of truth for shareable state.** Filter/sort/selected-row state syncs to
  query params (`DeepLinkHelper`) so every "workspace" view is bookmarkable and shareable between
  operators — state flows view-model → URL, and on load, URL → view-model, never bypassing that
  sync path.

---

## 16. Open Decisions Requiring Your Input

**Resolved:** no persistence layer in v1. The backend is completely stateless — every module in
§3 either fetches live from Integration Suite or, for Audit View/Role View, reads from an
existing platform capability (log service, XSUAA) rather than owning storage. Config is a single
`config.json`/`config.ts` surface (§11). If a future phase genuinely needs storage (e.g. Payload
Archive, or multi-year audit retention beyond the log service's own policy), that's a deliberate,
separate architecture decision to revisit explicitly — not something to smuggle in as a side
effect of another feature.

**Still open:**
1. **Namespace prefix.** This doc uses `com.middlewareops.integrationportal` as a placeholder throughout
   (UI5 namespace, module namespace, XSUAA `xsappname`). Needs your real reverse-domain prefix
   before Phase 1 file scaffolding starts, since it's threaded through every path and manifest.
2. **Credential storage for `config.json`'s "OAuth credentials" field** (§11) — recommend
   Destination-service-resolved secrets in any deployed environment, with the config file holding
   only the Destination *name*, not the secret value. Confirm this is acceptable, or state if you
   specifically want raw credentials in a (gitignored) local config for simplicity in early
   development.

**Also noting:** the repo currently contains a plain-JavaScript starter scaffold
(`webapp/Component.js` etc.) from initial setup. It predates this architecture and does not match
it (no TypeScript, no module structure, no namespace, and it wires a `mainService` OData model
directly into the UI5 app — which contradicts §1's "UI5 never calls Integration Suite directly"
rule). It should be treated as disposable — Phase 1 work replaces it wholesale under the real
namespace rather than evolving it in place.
