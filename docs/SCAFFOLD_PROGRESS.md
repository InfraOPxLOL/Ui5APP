# Phase 1 Scaffold — Progress & Conventions

Tracks what exists and the conventions every generated file must follow, so the scaffold stays
consistent across multiple generation passes.

## Conventions locked for this scaffold

1. **Namespace:** `com.middlewareops.integrationportal`.
2. **Frontend module folders are camelCase** (e.g. `webapp/modules/messageMonitoring/`) — required
   so UI5 namespace resolution (`...modules.messageMonitoring`) maps to the folder. **Backend
   module folders and REST routes stay kebab-case** (`srv/modules/message-monitoring`,
   `/api/v1/message-monitoring`).
3. **Custom UI5 controls** carry a hand-written `*.gen.d.ts` companion declaring the accessor
   signatures UI5 generates at runtime from `metadata` (mirrors `@ui5/ts-interface-generator`).
4a. **Every class that `extends` a real UI5 base class (`Component`, `Controller`, `Control`,
    `Element`, `ManagedObject`, `JSONModel`, `EventBus`-derived, etc.) MUST carry a `@namespace
    <dotted.path>` JSDoc tag directly above the class.** `ui5-tooling-transpile` only emits a UI5
    `.extend()`-based class (constructible by the UI5 runtime) when this tag is present; without it,
    the class transpiles to a native ES6 class and UI5's factory throws
    `Class constructor X cannot be invoked without 'new'` at runtime — a silent-until-runtime
    failure that `tsc` and `ui5 build` do **not** catch. Conversely, do **not** annotate classes that
    extend a plain (non-UI5) base class such as `BaseService` — annotating them makes the
    transpiler try to call `.extend()` on a class that has no such static method
    (`BaseService.extend is not a function`).
4b. **Any `.extend()`-based class (see 4a) must not rely on TS class-field initializers for values
    read inside `init()` and `constructor` overrides.** UI5's `Component`/`ManagedObject`
    construction machinery invokes `init()` *synchronously from within* the base constructor call —
    before any subclass field initializer declared after `extends` has run. Declare the field with a
    type only (`private x!: Foo;`) and assign it as the first statement inside `init()` instead.
    (Plain `Controller`-derived classes are NOT affected — `onInit()` is invoked later by the
    view/MVC framework, well after construction completes, so field initializers used only in
    `onInit()` are safe.)
4c. **A `Control`/`Element` subclass that adds no custom rendering must explicitly declare
    `public static readonly renderer = "<parent>Renderer";`** (e.g. `"sap.m.TableRenderer"`,
    `"sap.m.ObjectStatusRenderer"`). Omitting it makes UI5 try to auto-load a renderer module named
    after the subclass (`ConfigurableTableRenderer.js`), which doesn't exist → 404 at route-activation
    time.
4d. **Never re-export a default export via `export { default as X } from "./Y"` in a barrel file
    consumed by this toolchain.** That syntax compiles to a direct (non-interop-safe) `.default`
    property read, which breaks when the source module's default export is transpiled as a bare
    return value (no `.default` wrapper — the common case for a plain `export default class`).
    Instead: `import X from "./Y"; export { X };` — normal imports go through the toolchain's
    `_interopRequireDefault` helper, which handles both module shapes. (Hit this in
    `core/formatters/index.ts`.)
5. **Backend is ESM** (`"type": "module"`, `NodeNext`): relative imports use explicit `.js`
   extensions in the TypeScript source.
6. **No `any`.** Boundary-only `unknown`, narrowed immediately. No TODO comments; every placeholder
   has real documentation and a compiling signature.
7. **Layering:** controllers → services → clients. Controllers hold no business logic. `core/` and
   `library/` never import from `modules/` or `shell/`.
8. **Services expose public methods future phases implement.** Phase 1 method bodies return typed
   empty/placeholder results (never throw "not implemented"), so the app runs end-to-end.

## The 15 modules (id · frontend folder · backend folder · phase)

| id | frontend `modules/` | backend `modules/` | phase |
|---|---|---|---|
| dashboard | `dashboard` | `dashboard` | 1 |
| messageMonitoring | `messageMonitoring` | `message-monitoring` | 1 |
| liveMonitoring | `liveMonitoring` | `live-monitoring` | 1 |
| jmsQueue | `jmsQueue` | `jms-queue` | 1 |
| messageReplay | `messageReplay` | `message-replay` | 1 |
| alertNotification | `alertNotification` | `alert-notification` | 1 |
| auditView | `auditView` | `audit-view` | 1 |
| roleView | `roleView` | `role-view` | 1 |
| administration | `administration` | `administration` | 1 |
| certificateManagement | `certificateManagement` | `certificate-management` | 2 |
| securityMaterials | `securityMaterials` | `security-materials` | 2 |
| apiMonitoring | `apiMonitoring` | `api-monitoring` | 2 |
| valueMapping | `valueMapping` | `value-mapping` | 3 |
| integrationAdvisor | `integrationAdvisor` | `integration-advisor` | 3 |
| analytics | `analytics` | `analytics` | 3 |

## Per-module file template

**Frontend** (`webapp/modules/<camelCase>/`): `Component.ts`, `manifest.json`,
`view/List.view.xml`, `controller/List.controller.ts`, `model/<Module>Model.ts`,
`service/<Module>Service.ts`, `config/columns.ts`, `formatter/<Module>Formatter.ts`,
`i18n/i18n.properties`.

**Backend** (`srv/src/modules/<kebab-case>/`): `routes.ts`, `controller.ts`, `service.ts`,
`dto.ts`, `validators.ts`.

## Status

- [x] Foundation (root workspace, tsconfig.base, mta.yaml, xs-security.json, config, approuter, README)
- [x] Frontend entry (index.html, index.ts, manifest.json, Component.ts, i18n, css)
- [x] Frontend `core/` (base, types, constants, errors, logging, formatters, utils, events, services)
- [x] Frontend `library/` (controls + `.gen.d.ts`, fragments)
- [x] Frontend `shell/` (Shell view/controller, ModuleRegistry, NotificationPanel)
- [x] Frontend `modules/` (15 module components — generated)
- [x] Backend `srv/src/` (server, app, config, core, 15 modules + API router)
- [x] Test placeholders (`app/webapp/test/` QUnit + OPA5, `srv/test/` node:test — 6 backend tests pass)
- [x] ESLint (flat config) + Prettier config — whole repo lint-clean and formatted
- [x] `srv/README.md`, `app/README.md` (+ `app/webapp/test/`, `srv/test/` READMEs)

### Phase 1 verification — all green

| Check | Result |
|---|---|
| Backend `tsc` | ✅ |
| Frontend `tsc --noEmit` | ✅ |
| `ui5 build` | ✅ |
| ESLint (whole repo) | ✅ |
| Prettier `--check` | ✅ |
| Backend tests (`node:test`, 6) | ✅ |

**Phase 1 scaffold is complete.** Business functionality is implemented in later phases; every
module is already registered, routed, present in the sidebar, and backed by placeholder services.

## Verification notes / fixes applied during compile

- Backend deps slimmed to what is actually imported (dropped `uuid`, `pino-http`, `@sap/xssec`,
  `@sap-cloud-sdk/*`, `@sap/xsenv`); identity uses `node:crypto`.
- Custom controls bind their custom properties via `bindProperty` (post-construction) instead of
  constructor settings, avoiding the need for generated `$…Settings` types.
- `AppError` uses `this.constructor.name` (not `new.target`) — the UI5 bundler's static analyzer
  cannot parse the `new.target` meta-property.
- Corrected version pins: `@sapui5/types@1.120.47`, `ui5-tooling-transpile@^3.11.3`,
  `@sap/ux-ui5-tooling@1.28.0`, `@sap/approuter@^20.10.0`, `@types/express@^4.17.21`.

## Runtime verification (browser) — bugs found & fixed

`tsc` and `ui5 build` are necessary but **not sufficient**: they don't catch UI5-runtime-only
failures. Actually running the app (backend + `ui5 serve`, loaded in a real browser, checking the
console) surfaced four bugs invisible to every static check above. All are now fixed and captured as
conventions 4a–4d. In order found:

1. `Class constructor Component cannot be invoked without 'new'` — missing `@namespace` tags → see 4a.
2. `Cannot read properties of undefined (reading 'registerGlobalHandlers')` — `Component.ts` used a
   class-field initializer for `errorHandler`, read too early by `init()` → see 4b.
3. `BaseService.extend is not a function` — the namespace-annotation pass over-applied `@namespace`
   to `*Service.ts` files, which extend the plain `BaseService` → see 4a (the "conversely" clause).
4. `ConfigurableTableRenderer.js ... 404` — custom controls need an explicit `renderer` pointing at
   the parent's → see 4c.
5. `Cannot read properties of undefined (reading 'formatDateTime')` — the `core/formatters/index.ts`
   barrel used `export { default as X } from` re-export syntax → see 4d.

**Takeaway for future phases:** after any change to a `Component`/`Controller`/`Control`/`Model`
class, custom control, or barrel file, actually boot the app (`npm run start:dev --workspace=srv` +
`npm run start --workspace=app`) and check the browser console — don't rely on `tsc`/`ui5 build`
alone.

## Phase 3 — Platform Foundation (complete)

Built the enterprise platform frameworks every future module uses. No Integration Suite
connectivity, no business logic, no renames/moves — everything additive on the Phase-1 skeleton.

1. **Configuration framework** — `config/config.json` replaced by ten typed domain files
   (`application`, `environment`, `tenants`, `queues`, `refresh`, `features`, `theme`,
   `monitoring`, `logging`, `security`). One zod schema per file (`srv/src/config/schemas/`),
   fail-fast boot validation with cross-field guardrails (duplicate ids, default-profile/theme
   membership, manual-retry consistency). `<name>.local.json` gitignored overrides.
2. **Backend `ConfigService`** (`srv/src/config/ConfigService.ts`) — singleton, deep-frozen, the
   only file reader; typed getters (`getApplication/Environment/Tenant(s)/Queues/RefreshIntervals/
   Features/Theme/Monitoring/Logging/Security`, `isModuleEnabled`, `isFeatureEnabled`). Old
   `config.ts` kept as deprecated facade. `CONFIG_DIR`/`LOG_LEVEL` env overrides. Consumers rewired:
   `app.ts` (CORS/body-limit/rate-limit from `security.json`), `logger.ts` (level from
   `logging.json`), `destinations.ts`, administration service.
3. **Frontend `ConfigService`** — mirrors the backend via the enlarged `/administration/config`
   projection (`ClientConfigDto`); typed getters incl. `getDefaultTenant`, `getQueues`,
   `getTheme`, `getMonitoring`, `getClientLogging`.
4. **Error frameworks** — backend adds `ConfigurationError` (non-operational), `AuthenticationError`,
   `AuthorizationError`, `ServiceError`, `IntegrationSuiteError` (tenant-aware, extends
   `UpstreamError`); frontend adds matching kinds + `errorFromEnvelope` code→class mapper wired
   into `ApiClient`; `ErrorHandler` presents the new kinds.
5. **Logging frameworks** — both sides: levels up to `critical`, category loggers
   (`getLogger(category)` / `ClientLogger.getLogger`), correlation-id binding, config-driven
   (level, ship-level, flush cadence, audit toggle).
6. **Constants** — `Icons` (wired into `ModuleRegistry`), `Colors`, `DateFormats`
   (+`TimeWindowPresetsHours`), `ContentTypes`, `FileTypes`, `RetryState` (existing
   `MessageStatus`/`QueueStatus`/`Severity`/`RouteNames` unchanged).
7. **Utilities** — `DateUtils`, `TimeUtils` (debounce/throttle), `StringUtils`, `JsonUtils`,
   `XmlUtils`, `DownloadUtils` (single download path; `ExportHelper` now delegates),
   `ClipboardUtils`, `ValidationUtils`, `SearchUtils`.
8. **API foundation** — `srv/src/core/providers/`: `IIntegrationSuiteClient`,
   `IMonitoringProvider`, `IJmsProvider`, `IPayloadProvider`, `ICertificateProvider`,
   `IRuntimeProvider`, `IAlertProvider` + neutral domain types. Interfaces only — no HTTP.
9. **Global models** — `ApplicationModel`(`app`), `ConfigurationModel`(`configState`),
   `ThemeModel`(`theme`), `UserModel`(`user`), `TenantModel`(`tenant`, publishes
   `session:tenantChanged`), `NotificationModel`(`notifications`) + `ThemeService`
   (config-driven theme application). Wired in `Component.init()`/`bootstrap()`; legacy `global`
   model untouched.
10. **Tests** — backend: shipped config files validate against schemas + guardrail negatives
    (20 tests). Frontend: QUnit for `StringUtils`/`SearchUtils`.
11. **Docs** — `config/README.md` full property reference; READMEs for providers and models;
    core/srv README updates.
