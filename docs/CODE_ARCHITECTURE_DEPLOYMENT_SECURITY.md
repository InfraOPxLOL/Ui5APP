# Integration Portal — Code Architecture, Deployment & Security Guide

**Status:** Descriptive — every claim below was verified against the actual repository content, not
carried over from `docs/ARCHITECTURE.md` (which is an early planning doc: its module list, folder
layout and "Open Decisions" section predate the real build and no longer match what's in the repo).
Where something is aspirational rather than built, that's called out explicitly — this document does
not paper over gaps.

---

## Table of Contents

1. [Codebase Overview](#1-codebase-overview)
2. [Coding Conventions & Best Practices Actually Enforced](#2-coding-conventions--best-practices-actually-enforced)
3. [Design Patterns Used, With Real Examples](#3-design-patterns-used-with-real-examples)
4. [Deployment Architecture — BTP Cloud Foundry via BAS](#4-deployment-architecture--btp-cloud-foundry-via-bas)
5. [Multi-Tenant Connectivity](#5-multi-tenant-connectivity)
6. [XSUAA Security — Roles & Policies](#6-xsuaa-security--roles--policies)
7. [Connecting to BTP Identity Once Deployed](#7-connecting-to-btp-identity-once-deployed)
8. [Pre-Deployment Checklist](#8-pre-deployment-checklist)
9. [Honest Gaps & Recommendations Summary](#9-honest-gaps--recommendations-summary)

---

## 1. Codebase Overview

### 1.1 Monorepo layout

npm workspaces, three packages, one root `package.json`:

```
integration-portal/
├── approuter/     — @sap/approuter, serves the UI5 app + reverse-proxies /api and /ws
├── app/           — SAPUI5 1.120 + TypeScript, single root Component
├── srv/           — Node.js + Express + TypeScript backend
├── config/        — the ONLY persisted state: eleven JSON files, ConfigService-validated
├── mta.yaml       — Cloud Foundry deployment descriptor
└── xs-security.json — XSUAA scopes/role templates/role collections
```

`npm run build` builds `app` then `srv`; `npm run deploy` runs `mbt build && cf deploy`. There is
**no CI/CD pipeline configured** in this repo (no `.github/workflows`, no other pipeline definition
found) — `npm test`/`npm run lint` are run manually today, not gated automatically on push or PR.

### 1.2 Layer architecture

Every request follows the same path, with no shortcuts:

```
UI5 Controller
   │  (never calls fetch/XHR/OData directly)
   ▼
Frontend Service (modules/*/service/*Service.ts)
   │  the ONLY code allowed to call the shared ApiClient
   ▼
ApiClient  →  [approuter — XSUAA session, CSRF]  →  Express route
                                                        │
                                                        ▼
                                              Backend Controller (thin: parse → call → shape)
                                                        │
                                                        ▼
                                              Backend Service (modules/*/service.ts)
                                                        │
                                                        ▼
                                              Operations Engine (composition root)
                                                        │
                                                        ▼
                                    Integration Suite SDK — IXxxProvider
                                    (RealXxxProvider or MockXxxProvider, selected
                                     per `config/connectivity.json`'s `mode`)
                                                        │
                                                        ▼
                                        SAP Integration Suite (real tenant, OData/REST)
```

The UI **never** talks to the SDK or knows an Integration Suite entity-set name — this is enforced
by the module-boundary convention (§2), not just documentation.

### 1.3 Module inventory (actual, current)

Two product initiatives share one platform. **21 modules total** — the frontend and backend folder
names mirror each other 1:1 (kebab-case backend, camelCase frontend):

**Operations Platform (15 modules)** — `dashboard`, `messageMonitoring` (the most built-out module —
framework-aware detection + recovery, see the module's own docs), `payloadStudio`, `recoveryCenter`,
`runtimeCenter`, `certificateSecurityCenter`, `jmsQueue`, `messageReplay`, `alertNotification`,
`auditView`, `roleView`, `administration`, `apiMonitoring`, `integrationAdvisor`, `analytics`.
`apiMonitoring`/`integrationAdvisor`/`analytics` are feature-flagged off in `config/features.json`
today.

**CoE Framework (6 modules)** — `coeAdmin`, `coeRouter`, `coeRegistry`, `coeDlq`, `coeRuleBuilder`,
`coePartnerDashboard`, presented through one tabbed shell (`coePartnersRoutes`, frontend-only —
composes the existing Router/Registry/RuleBuilder/PartnerDashboard views, no new backend module) so
the sidebar shows 3 entries instead of 6 while all 6 routes stay independently reachable.

**Shared, non-module layers**: `srv/src/operations/` (the Operations Engine — one composed
business-logic layer every module's service reads through, never the SDK directly),
`srv/src/sdk/` (the Integration Suite SDK: `providers/Real*` + `providers/Mock*` behind one
`IXxxProvider` interface per domain), `srv/src/core/` (middleware, errors, logging, HTTP client),
`app/webapp/core/` + `shell/` + `library/` (frontend framework/chrome layers — deliberately never
feature-specific).

### 1.4 Frontend structure — layer-first, single root Component

```
app/webapp/
  Component.ts, manifest.json          — ONE root Component (no per-module Components)
  controller/<module>/   view/<module>/   model/<module>/
  service/<module>/      formatter/<module>/  config/<module>/
  fragment/<module>/     css/<module>/   i18n/<module>/i18n.properties
  core/                  — base classes, formatters, utils, errors, events (framework, not features)
  shell/                 — ToolPage shell, registry-driven nav (ModuleRegistry, WorkspaceCatalog),
                            permissions (PermissionEngine, RoleCollections), notifications
  library/                — reusable custom controls + shared fragments
  test/                    — QUnit unit + OPA5 integration (SAP-standard location)
```

This is a *layer-first* structure (all controllers together, all views together, grouped by
module within each layer), not the more common *feature-first* nesting — a deliberate, already
completed migration (dissolving what used to be 19 separately lazy-loaded module Components into one
root Component with top-level layer folders).

### 1.5 Backend structure

```
srv/src/
  modules/<kebab-case>/   — routes.ts, controller.ts, service.ts, dto.ts, validators.ts
  operations/             — OperationsEngine (composition root) + engines/ + dto/ + recovery/
  sdk/                    — client/, providers/ (Real*/Mock*), odata/, rest/, pipeline/, mock/, auth/, destination/
  core/                   — middleware, errors, http (base authenticated client), providers (interfaces + types)
  config/                 — ConfigService, env.ts, schemas/, sdkClientFactory.ts, xsuaa.ts
  routes/index.ts         — mounts every module router under /api/v1/<module-kebab>
```

**Module-boundary rule, consistently followed**: no backend module ever imports a sibling module's
`service.ts` singleton — only pure constants/functions cross module boundaries (e.g.
`coe-partner-dashboard` imports `JMS_AGREEMENTS_PID`/`fromStorageKey` from `coe-router`, never
`coeRouterService` itself).

---

## 2. Coding Conventions & Best Practices Actually Enforced

These aren't aspirational — every one below is visible in the actual code, not just written down
somewhere and ignored:

- **TypeScript strict mode**, both workspaces. `zod` validates every config file at boot
  (`ConfigService`) and every request body/query at the API boundary (`validators.ts` per module,
  applied via a `validateRequest` middleware) — nothing user-supplied reaches a service unchecked.
- **Real/Mock provider split, everywhere the SDK touches the tenant.** Every domain
  (`IJmsProvider`, `IMonitoringProvider`, `ICertificateProvider`, `IPartnerDirectoryProvider`, …) has
  exactly one interface, a `Real*Provider` (live OData/REST) and a `Mock*Provider` (deterministic,
  seeded fixtures via `MockEngine`). `config/connectivity.json`'s `mode` picks one for the whole
  process at boot — no module ever branches on mode itself.
- **Data-honesty convention, enforced by design, not just discipline.** Every DTO field is one of:
  real (read from a live provider), a documented heuristic (derived, explicitly labeled), or a
  reserved extension point (`undefined`/empty with a stated reason). A value the platform cannot
  determine is never invented — e.g. Recovery's replay action reports `executed: false` with a
  reason rather than pretending a message was re-injected.
- **Configuration is a frozen singleton, loaded once.** `ConfigService` reads every `config/*.json`
  file once at process boot, validates each against its zod schema, and deep-freezes the composed
  result — it does **not** hot-reload. Restarting the backend is required after any config edit
  (see the deployment checklist, §8).
- **Formatter centralization.** Every module's date/duration/size/status formatting delegates to
  `core/formatters` — a formatter is never inlined in a controller or view.
- **i18n is per-module and never inherited.** `Component.ts`'s `applyModuleI18n` derives the module
  id from the routed view's name and binds only that module's `i18n/<module>/i18n.properties` as the
  `"i18n"` model. A view referencing another module's key silently renders the raw key string — the
  one sharp edge in this convention, and the reason nested views (the `coePartnersRoutes` tabbed
  shell) need an explicit `applyNestedI18n()` call rather than inheriting the host's bundle.
- **Testing**: backend uses Node's built-in `node:test` runner via `tsx` (**435 tests** as of the
  most recent module work), frontend uses QUnit run in-browser via a raw-CDP script (no
  Puppeteer/Playwright dependency) driving controller methods directly rather than simulating DOM
  clicks (**149 tests**). No headless CI runner exists yet — this is a documented, deliberate gap
  from the original roadmap (Thread B, Phase 8), not an oversight.

---

## 3. Design Patterns Used, With Real Examples

- **Provider pattern** (`sdk/providers/`) — one interface, swappable real/mock implementation,
  selected by configuration rather than by call-site branching. This is the single most repeated
  pattern in the codebase and the reason every module can be developed and tested with zero network
  access (`mode: "mock"`).
- **Strategy pattern** (`operations/recovery/`) — five recovery strategies (TPM V2, JMS Framework,
  Common IDoc Router, IDoc Status Sync, Manual fallback), one shared base class
  (`QueueRecoveryStrategyBase`) carrying the common move→verify→retry mechanics, selected by a
  `RecoveryStrategyResolver` built from `config/frameworks.json`. Adding a framework is a config
  entry plus, at most, one new strategy class — the core `RecoveryEngine` contains no
  framework-specific branching at all.
- **Composition root** (`OperationsEngine`, `IntegrationSuiteSdkClient`) — one class per layer whose
  entire job is wiring dependencies together; every other class receives its dependencies via
  constructor injection rather than reaching for a singleton.
- **Config-driven behavior over hardcoded branching** — queue topology (`config/queues.json`),
  framework detection rules and DLQ→target mappings (`config/frameworks.json`), module
  enablement (`config/features.json`) are all data, not code; the engines that consume them are
  generic across whatever configuration they're given.
- **Declarative permission requirements** — `PermissionRequirement` objects (`allScopes`/`anyScope`/
  `anyRoleCollection`) attached to modules/actions/routes, evaluated generically by one
  `PermissionEngine.isSatisfied()` rather than scattered `if (hasRole(...))` checks per screen.

---

## 4. Deployment Architecture — BTP Cloud Foundry via BAS

### 4.1 What "deploying via BAS" means for this repo

Business Application Studio is the *IDE*, not a separate deployment mechanism — the actual
deployment is standard MTA-to-Cloud-Foundry, which BAS's terminal runs the same way any Cloud
Foundry CLI would:

```bash
git clone -b <branch> https://github.com/<org>/Ui5APP.git
npm install                      # workspaces monorepo — one install covers approuter/app/srv
npm run deploy                   # = mbt build && cf deploy mta_archives/integration-portal_0.1.0.mtar
```

A **"Full Stack Cloud Application" dev space** in BAS is the right choice — it matches this repo's
`mta.yaml`/`xs-security.json`/`approuter/` shape and comes with CF CLI, MBT, and Node.js
preinstalled. `.env` is gitignored and doesn't come across in a clone; for deployed environments
credentials come from bound services/environment variables, not `.env` (§5).

### 4.2 `mta.yaml` — what actually gets deployed

Three modules, four resources — no database, no persistence service, matching the stateless-backend
design:

| Module | Type | Requires | Provides |
|---|---|---|---|
| `integration-portal-srv` | `nodejs` | `xsuaa`, `destination` | `srv-api` (its own URL, for the approuter to bind to) |
| `integration-portal-approuter` | `approuter.nodejs` | `xsuaa`, `destination`, `html5-repo-runtime`, `srv-api` (as a `destinations` group entry with `forwardAuthToken: true`) | — |
| `integration-portal-app-content` | `com.sap.application.content` | `html5-repo-host` | — (pushes the built UI5 app into the HTML5 Application Repository) |

| Resource | Service | Plan |
|---|---|---|
| `integration-portal-xsuaa` | `xsuaa` | `application`, configured from `./xs-security.json`, `xsappname: integration-portal-${org}-${space}` |
| `integration-portal-destination` | `destination` | `lite` |
| `integration-portal-html5-repo-host` | `html5-apps-repo` | `app-host` |
| `integration-portal-html5-repo-runtime` | `html5-apps-repo` | `app-runtime` |

The `xsappname` is **space-scoped** (`integration-portal-${org}-${space}`) — deploying the same MTA
into a dev, QA and prod space each gets its own distinct XSUAA app id automatically; role collections
provisioned in one space's subaccount don't leak into another.

### 4.3 What has and hasn't been exercised

Per the project's own handoff notes, **this MTA has not been deployed end-to-end in any session to
date** — the architecture is complete and every module builds/tests cleanly, but a live Cloud
Foundry deployment (with real XSUAA role-collection assignment, a bound Destination service instance,
etc.) is still an open item, not a verified one. Treat everything in §6–§7 below as "how it's wired
to work," not "already proven in a live BTP landscape."

---

## 5. Multi-Tenant Connectivity

### 5.1 The real current state

**`config/tenants.json` has exactly one tenant configured today** (`id: "primary"`, the trial
tenant used throughout development). The architecture supports N tenants — `TenantConfig` is an
array, every resolver takes an optional `tenantId` — but "3 tenants" is not yet a fact about this
deployment; it's a capability that needs 2 more config entries to become one.

### 5.2 How to actually add tenants

1. Add an entry per tenant to `config/tenants.json` — each needs its own `id`, `destinationName`,
   `baseUrl`, `region`, `environment`. Exactly one should have `"default": true`.
2. Register a matching connectivity strategy for each new tenant id (§5.3).
3. Restart the backend — `ConfigService` freezes config at boot, so a `tenants.json` edit on a
   running process has no effect until restart (the same gotcha applies to every config file).

### 5.3 Two connectivity modes — one fully wired, one only partly

`config/connectivity.json`'s `destinationDiscovery` picks between two real, working strategies —
built in `srv/src/sdk/destination/` and composed by `srv/src/config/sdkClientFactory.ts`:

| Mode | How credentials are resolved | What it needs |
|---|---|---|
| `"static"` (**currently configured**) | `connectivity.json`'s `tenantAuth[]` declares each tenant's *auth type* (`basic` or `oauth-client-credentials`); the actual secret comes from an environment variable named `CPI_<TENANTID>_<KEY>` (e.g. `CPI_PRIMARY_CLIENT_ID`/`_SECRET`) | One `tenantAuth` entry + one env-var pair per tenant. No BTP service binding required. |
| `"btp"` (**recommended for a real BAS/CF deployment with multiple tenants**) | Credentials are looked up live from the bound SAP BTP Destination service, keyed by each tenant's `destinationName` | The Destination service instance already provisioned in `mta.yaml` bound; `DESTINATION_SERVICE_URL`/`_TOKEN_URL`/`_CLIENT_ID`/`_CLIENT_SECRET` env vars set (all four together or none — `env.ts` enforces this); one Destination defined per tenant in the BTP subaccount (Basic or OAuth2ClientCredentials auth only — anything else is rejected with a named `ConfigurationError` at the point of use, not a silent fallback) |

**One thing worth knowing before you touch this:** `srv/src/config/destinations.ts` (a file with a
`resolveDestination()` function) is **dead code** — nothing in the codebase imports it. It's a
leftover placeholder from an earlier phase, superseded by the real, fully-wired implementation in
`srv/src/sdk/destination/`. Don't extend `destinations.ts` thinking it's the live path; it isn't
called anywhere.

**Recommendation for 3 tenants in a real BAS deployment:** switch `destinationDiscovery` to `"btp"`.
Static mode means 3 sets of OAuth client-credential secrets sitting in Cloud Foundry environment
variables per space; BTP mode means the Destination service (already a required resource in
`mta.yaml`) holds them, rotates independently of a redeploy, and is the pattern SAP's own tooling
expects.

---

## 6. XSUAA Security — Roles & Policies

### 6.1 What's actually provisioned (`xs-security.json`)

**6 scopes**, **3 role templates**, **3 role collections** — the entire live security surface today:

| Role collection | Scopes granted |
|---|---|
| `IntegrationPortal_Viewer` | `Viewer` |
| `IntegrationPortal_Operator` | `Viewer`, `Operator`, `MessageReplay.Execute`, `JmsQueue.Purge` |
| `IntegrationPortal_Administrator` | `Viewer`, `Operator`, `Administrator`, `MessageReplay.Execute`, `JmsQueue.Purge`, `Administration.Manage` |

`tenant-mode: "dedicated"` — this app is provider-account-scoped per subaccount, not a
multi-tenant SaaS application (no subscription/onboarding flow). `token-validity: 900` seconds,
`refresh-token-validity: 3600`, `redirect-uris` restricted to `*.cfapps.*.hana.ondemand.com`.

### 6.2 The frontend already models a much finer-grained target state than is provisioned

`app/webapp/shell/permissions/RoleCollections.ts` declares ~19 role collections total — the 3 real
ones above, plus a roadmap set (`PI_OPERATIONS_VIEWER`, `PI_RETRY_OPERATOR`, `PI_RECOVERY_ADMIN`,
etc.) with inheritance chains, each expressed **in terms of the 6 scopes that actually exist today**.
This is intentional and explicitly documented in the file itself: adding a finer-grained role later
is "a deployment concern (provisioning the matching XSUAA role collection), not a code change" — the
`PermissionEngine` already knows how to evaluate any of them. Don't be surprised that the code
references role collections that don't exist yet in `xs-security.json`; that's the designed
extension point, not a bug.

### 6.3 Enforcement — client-side gating, server-side authority

- **Frontend**: `PermissionEngine.isSatisfied(requirement)` hides navigation entries, actions and
  buttons the current user's scopes don't cover (`RouteGuard`, `WorkspaceCatalog`,
  `INVESTIGATION_ACTIONS` metadata, etc.) — but this is convenience, not security.
- **Backend**: every state-changing route explicitly re-checks the scope via `requireScope(scope)`
  middleware (e.g. `requireScope("MessageReplay.Execute")` on the message-replay and
  message-monitoring recovery routes, `requireScope("JmsQueue.Purge")` on the purge route) — a 403
  with a named missing scope if the caller's JWT doesn't carry it. The backend is the actual
  authority; the frontend never being trusted alone is the explicit architecture rule.

### 6.4 A real gap worth flagging clearly: JWT signature is not verified

`srv/src/core/middleware/auth.middleware.ts` decodes the bearer token's payload segment
(base64url + `JSON.parse`) to read `scope`/`user_id`/etc. — it does **not** cryptographically verify
the token's signature. This is documented in the file's own comment as the one hardening step still
needed before real production exposure: swap in `@sap/xssec`'s token validation at the single
documented seam (`deriveSecurityContext`) — nothing else in the request pipeline changes.

In the deployed topology this is *currently* mitigated by the approuter sitting in front of the
backend — the approuter is the component that actually authenticates the session against XSUAA
before forwarding anything, and `xs-app.json` marks every `/api/*` and `/ws/*` route
`"authenticationType": "xsuaa"`. But that mitigation only holds as long as the Node backend is never
reachable except through the approuter. If the `srv` module's own CF route were ever exposed
directly (a misconfigured route, a debugging shortcut, a future split-out microservice), an
unsigned/forged JWT payload would be accepted as-is. Treat this as a pre-production blocker, not a
nice-to-have.

### 6.5 The local-dev auth bypass — and the config value that controls it

The same middleware has an intentional fallback: when no bearer token is present **and**
`config/environment.json`'s `kind` is `"development"`, it fabricates a full-admin
`SecurityContext` (every scope granted) so local development doesn't need a real XSUAA token.

**`config/environment.json` currently has `"kind": "development"`.** If this exact file were
deployed to BTP as-is, any request that reaches the backend without a bearer token would be treated
as a fully-privileged administrator — because the approuter normally guarantees every forwarded
request carries a token, this is latent rather than immediately exploitable, but it's a real trap:
one direct route to the backend, one missed header, and the bypass activates in production. This is
the single highest-value item in the pre-deployment checklist (§8).

---

## 7. Connecting to BTP Identity Once Deployed

### 7.1 The actual OAuth2/OIDC flow, end to end

```
Browser
   │  GET /
   ▼
approuter  ──(no session)──►  XSUAA  ──(delegates to)──►  Corporate IdP / SAP IAS
   │                                                          (however the subaccount's
   │                                                           trust configuration is set —
   │                                                           this app never configures
   │                                                           this layer itself)
   ▼
Browser authenticates against whatever the subaccount trusts
   │
   ▼
XSUAA issues a JWT (scopes minted from the user's assigned role collections)
   │
   ▼
approuter holds the session, forwards the JWT as `Authorization: Bearer …`
on every proxied /api/* and /ws/* call (xs-app.json, forwardAuthToken: true
on the srv-api destination)
   │
   ▼
Backend derives SecurityContext from the forwarded JWT (§6.4's caveat applies here)
```

**This app does not integrate with BTP Identity directly.** XSUAA is the only identity-related
service in `mta.yaml`; whether XSUAA itself delegates to SAP Cloud Identity Services (IAS), a SAML
corporate IdP, or BTP's own default identity provider is a **subaccount-level trust configuration**,
set once in the BTP cockpit (Security → Trust Configuration) — completely transparent to this
codebase. Nothing in `app/`, `srv/`, or `approuter/` changes based on which identity provider sits
behind XSUAA.

### 7.2 What you actually do after `cf deploy` to make login work

1. **Role collection assignment** (BTP cockpit → Security → Role Collections, or Identity
   Provisioning if automated): assign `IntegrationPortal_Viewer`/`_Operator`/`_Administrator` to
   real users or groups. **This app has no admin screen for this** — `roleView`/`role-view` is
   explicitly read-only (it reflects the caller's *own* resolved scopes so the UI can gate itself; it
   never assigns or stores role membership). Role assignment always happens in BTP/XSUAA, by design
   (§14 of the original architecture doc — the one part of that early doc that does hold true today).
2. **Trust configuration** (if not using the subaccount default identity provider): BTP cockpit →
   Security → Trust Configuration → add the corporate IdP or IAS tenant. One-time, subaccount-level,
   unrelated to any redeploy of this app.
3. **Verify the XSUAA app id matches what you expect** — remember it's
   `integration-portal-${org}-${space}` (§4.2); role collections are provisioned against that exact
   `xsappname` per space.

---

## 8. Pre-Deployment Checklist

Concrete, ordered by how much it would hurt to skip:

1. **Set `config/environment.json`'s `kind` to `"production"` (or `"testing"`) before any BTP
   deployment.** Leaving it `"development"` activates the full-admin auth bypass on any
   unauthenticated request that reaches the backend (§6.5).
2. **Harden JWT verification** — replace the decode-only logic in `auth.middleware.ts` with
   `@sap/xssec` signature/issuer validation before this is reachable by anyone outside the
   development team (§6.4).
3. **Decide `static` vs `btp` destination discovery** for the target deployment (§5.3) and provision
   accordingly — either the per-tenant `CPI_<TENANTID>_*` environment variables, or the Destination
   service instance's Destinations, matching however many tenants you actually need connected.
4. **Populate `config/tenants.json`** with every tenant you intend to connect — today it has one.
5. **Provision role collections and assign real users** in the target subaccount (§7.2) — nothing in
   this app does that for you.
6. **Confirm the Destination service instance is actually bound** (`mta.yaml` already declares it as
   a required resource for both `srv` and `approuter` — this is automatic on `cf deploy`, but worth
   confirming post-deploy with `cf services`).
7. **Run the full test suite and a fresh build** (`npm test`, `npm run build`) immediately before
   packaging — there's no CI gate doing this for you (§1.1).

---

## 9. Honest Gaps & Recommendations Summary

| Gap | Where | Severity | Recommendation |
|---|---|---|---|
| JWT signature never verified | `srv/src/core/middleware/auth.middleware.ts` | High (pre-production blocker) | Swap in `@sap/xssec` at the documented `deriveSecurityContext` seam |
| `environment.json.kind` currently `"development"` | `config/environment.json` | High if deployed as-is | Flip to `"production"`/`"testing"` before any real deployment |
| Only 1 of N tenants configured | `config/tenants.json` | Expected — not a bug | Add entries per §5.2 before the "3 tenants" requirement is actually met |
| `destinations.ts` is dead/unused code | `srv/src/config/destinations.ts` | Low (confusing, not dangerous) | Delete it, or leave it but don't extend it — the real path is `sdk/destination/` |
| No CI/CD pipeline | repo-wide | Medium | `npm test`/`npm run lint`/`npm run build` are all already scriptable — wiring them into GitHub Actions (or equivalent) is the natural next step before a team beyond one person relies on this |
| Fine-grained `PI_*` role collections declared but unprovisioned | `RoleCollections.ts` vs `xs-security.json` | Low — intentional extension point | Provision only the ones you actually need finer-grained control over; the code already supports it with zero changes |
| MTA has never been deployed end-to-end | — | Medium | First real `cf deploy` should be treated as its own verification pass, not assumed to work because the architecture is sound on paper |
