# Handoff — Integration Portal

**Last updated:** 2026-07-15
**Author of this handoff:** Claude (agentic session), for whoever picks this up next (human or AI).
**Supersedes:** the previous handoff dated 2026-07-11 — that version predates the entire CoE Framework
build described in §4.7 below. Sections 1, 3–7 are rewritten to reflect the current state; §4.1–§4.6
are preserved as historical record of the original Operations Platform build.

> ⚠️ **Read this first: nothing in this repo is committed to git beyond the bare initial scaffold.**
> `git log` shows exactly one commit (`b573cef`, "Initial commit: SAPUI5 freestyle app scaffold").
> Everything else — the entire Operations Platform (13 phases), the CoE Framework (6 modules, built
> across several sessions including this one), the structural refactors, all of it — is **untracked**
> or a modification against that bare scaffold (`git status` shows `??`/` M`/` D` for essentially
> everything under `app/`, `srv/`, `config/`, `docs/`, plus `mta.yaml`, `xs-security.json`,
> `eslint.config.mjs`, `handoff.md` itself, etc.). **Commit before doing anything destructive**
> (`git reset --hard`, branch switches, etc. would lose everything).

---

## 1. The goal

Build **"Integration Portal"** (namespace `com.middlewareops.integrationportal`): an enterprise
monitoring/operations platform for SAP Integration Suite, deployed to SAP BTP Cloud Foundry. Stack:
SAPUI5 1.120 + TypeScript frontend (`app/`), Node.js + Express + TypeScript backend (`srv/`), connected
to a **real trial tenant**
(`https://d0e06a1ftrial.it-cpitrial05.cfapps.us10-001.hana.ondemand.com/api/v1/`).

Two architectural principles, honored throughout every module described in this document:

1. **`UI → backend module → Operations Engine → Integration Suite SDK (real or mock provider) → SAP
   Integration Suite`.** The frontend never talks to the SDK or knows an OData entity-set name.
2. **Never fabricate Integration Suite data.** Where real data isn't available through public APIs,
   the UI shows an honest "unavailable"/empty state with a documented reason, not an invented value.
   This has been the deciding factor in several design calls throughout the project — e.g. the DLQ
   dashboard's Replay action reports `executed: false` and a note explaining *why* it can't actually
   re-inject a message, rather than pretending it did.

**Status of the goal, in two parts:**

- The original **Operations Platform** (13 build phases — architecture → SDK → live connectivity →
  Operations Engine → Application Shell → Operations Workspace → Message Investigation → Payload
  Studio → Recovery Center → Runtime Center → Certificate & Security Center) is **functionally
  complete**: every workspace exists and either shows real tenant data or an honestly-labeled
  placeholder. A feature-completion roadmap for the remaining placeholder screens was scoped (§6) but
  **not started** — work was redirected to a second initiative instead.
- A second, later initiative — the **Universal CoE Framework** (6 modules layered on top of the same
  platform: Global Settings, Route Creation, Parameter Registry, DLQ & Recovery, Rule Builder, Partner
  Dashboard) — was scoped, built, and iterated across multiple sessions. As of this handoff, **its
  entire backlog is shipped and verified live against the real tenant** (§4.7). This was the primary
  focus of the session this handoff was written at the end of.

**What's next is genuinely open** — see §6. Neither the original Phase 2–9 roadmap nor any new CoE
work has been explicitly queued by the user as of this writing.

---

## 2. Current state of the UI

**Both dev servers are up and verified healthy right now** (restarted and confirmed as the last action
before writing this document):

| Server | Port | Verified |
|---|---|---|
| Backend (`srv`, `npm run start:dev`, tsx watch) | `:4004` | `GET /api/v1/coe-admin` → `200`, real tenant data flowing (confirmed in logs: `partnerDirectory.getStringParameter` calls against `.SYS_JMS_FRAMEWORK` all `200`) |
| Frontend (`app`, `ui5 serve`) | `:8080` | `GET /index.html` → `200` |

**⚠️ Known gotcha if you restart the backend after editing `config/*.json`:** `ConfigService`
(`srv/src/config/ConfigService.ts`) reads every `config/*.json` file once at process boot and
deep-freezes the result for the process lifetime — it does **not** hot-reload. If you add/enable a
module in `config/features.json` while the backend is already running, the frontend will silently
route it back to `#/home` (`RouteGuard` denies it — no console error, just a redirect) until the
backend process is actually restarted. Compounding wrinkle observed this session: killing the PID
reported by Git Bash's `ps aux` did **not** reliably kill the real Windows process (stale `/proc` PID
mapping) — the "restarted" process then crashed silently with `EADDRINUSE` while the old process kept
serving stale config. If a restart doesn't seem to take effect, verify the *true* owning PID via
PowerShell before concluding the restart failed:
```powershell
Get-NetTCPConnection -LocalPort 4004 | Select-Object OwningProcess
Stop-Process -Id <pid> -Force
```

**What renders — 21 feature modules across 9 workspaces**, all wired into the shell
(`shell/model/ModuleRegistry.ts` + `shell/registry/WorkspaceCatalog.ts`):

- **Operations Platform** (15 modules, from the original build): Dashboard, Message Monitoring,
  Payload Studio, Recovery Center, Runtime Center, Certificate & Security Center, JMS Queues, Message
  Replay, Alert Notification, Audit Trail, Roles, Administration, API Monitoring, Integration Advisor,
  Analytics. 12 enabled; `apiMonitoring`/`integrationAdvisor`/`analytics` remain feature-flagged off
  (`config/features.json`, `enabled: false`) and correctly redirect home via `RouteGuard`.
- **CoE Framework** (6 modules, the `Workspaces.CoE` workspace — `CoE Global Settings`, `Route
  Creation`, `Parameter Registry`, `DLQ & Recovery`, `Rule Builder`, `Partner Dashboard`): all 6
  enabled, all **fully live** against the real tenant, all re-verified working as of this session
  (§4.7). This is the only workspace with **zero** placeholder screens.

**Data-honesty status per screen:**

| Fully live | Partially live | Still placeholder |
|---|---|---|
| Dashboard, Message Monitoring, Payload Studio, Recovery Center, Runtime Center | Message Replay (no real retry count), JMS Queues (Purge action not wired to a button), Certificate & Security Center (Security Materials mostly unavailable), Administration (connectivity status always "UNKNOWN") | Alerts, Audit Trail, Roles, Integration Advisor, Analytics, API Monitoring |
| **All 6 CoE Framework modules** (Global Settings, Route Creation + its 3 wizards, Parameter Registry, DLQ & Recovery, Rule Builder, Partner Dashboard) | | |

The Operations Platform's placeholder/partial screens are unchanged from the previous handoff — none
of that roadmap (§6, old Phases 2–9) has been touched. All movement since 2026-07-11 has been on the
CoE Framework side.

---

## 3. Files currently being worked on

**None mid-edit.** The last completed unit of work (the Admin/DLQ UI-verification pass, §4.7's final
item) was fully verified live and its memory notes written. There is no in-progress edit to resume.

**Ephemeral scratchpad scripts** from this session (session temp dir, **not part of the repo** —
`C:\Users\duber\AppData\Local\Temp\claude\...\scratchpad\`, will not survive past this session/container).
Recreate similar ones if you need the same verification tooling; the pattern in all of them is: spawn
headless Chrome via raw CDP (the `ws` npm package, no Puppeteer/Playwright installed), drive the app by
calling controller methods directly (`ctrl.onSave()`, `model.setProperty(...)`) rather than simulating
DOM clicks — proved far more reliable for async, multi-step UI5 flows than firing synthetic click
events. Useful ones to know the shape of if you need to rebuild:

| Pattern | Purpose |
|---|---|
| `verify-*.mjs` scripts throughout this session | Seed real tenant data via a module's own frontend `service.*()` methods, drive the UI/controller under test, assert on model state and/or rendered DOM text, then delete every parameter written via `coeRegistryService.remove(pid, id)` (or the Rule Builder's own service for binary parameters) and re-verify absence. |
| `audit-*.mjs` scripts | Read-only walkthroughs (no tenant writes) — screenshot a module in several states for a visual/UX audit before deciding what to fix. |

**⚠️ Test-methodology gotcha specific to `coeRouter`:** the Creation Hub's `NavContainer` keeps **all
3 nested wizard flows simultaneously instantiated in the DOM** (not lazy), and all three share
identical local control ids (`id="idocInput"` etc.) and near-identical structure. A generic
`document.querySelectorAll('textarea')[0]`-style lookup will silently grab whichever flow rendered
first in DOM order — **not necessarily the one currently visible** — once more than one flow has ever
been opened in the same test session. Always resolve a specific flow's controller via its own static
id suffix: `document.querySelectorAll('[id$="routerOnlyFlow"]')` etc. This cost real debugging time
twice this session before being written down.

**No plan file is currently open** — the last approved plan (the layer-first structural refactor) is
long since executed; every feature built since then (all of §4.7) was scoped via `AskUserQuestion` at
the point of ambiguity rather than a formal plan-mode document, per the user's established working
style this session (confirm the 1–2 genuinely undetermined design forks up front, then build the whole
feature to completion with live verification before reporting back).

---

## 4. What has changed so far

Roughly chronological, grouped into eras. §4.1–§4.6 are the Operations Platform build (unchanged since
the 2026-07-11 handoff — preserved here for continuity). §4.7 is new.

### 4.1 Original build (Phases 1–13)
Architecture + SDK (real/mock provider split) + live tenant connectivity + Operations Engine +
Application Shell + Operations Workspace + Message Investigation Workspace + Payload Studio + Recovery
Center + Runtime Center + Certificate & Security Center. Each phase's own README lives under
`docs/modules/`.

### 4.2 Live production-bug fixing pass
Root causes found and fixed when the app was first actually opened in a browser: both dev servers
simply weren't running; `RealJmsProvider` called entity-set names that don't exist on the tenant's real
JMS OData API (rewritten against the actual API — confirmed via `$metadata.xml` + curl probing);
`OperationsService.getOverview()`/`search()` used a single `Promise.all` so one failing domain 502'd
the entire dashboard (switched to `Promise.allSettled` with honest per-domain fallbacks).

### 4.3 Gemini-introduced regressions
A separate AI (Gemini) had also been editing this codebase in parallel; two real regressions were
found and fixed: a silent fabrication (`capacityUsedPct: 0` hardcoded for every queue, violating the
"never fabricate" rule) and a runtime error from calling a UI5 static method not actually present in
the pinned UI5 patch version.

### 4.4 UI documentation + product cleanup ("Product Phase 1")
Wrote `docs/UI_GUIDE.md` (ground-truth tab-by-tab reference, built by reading every
controller/service/backend module). Removed 4 dead/placeholder modules from navigation per explicit
user direction, catching 7 dangling route references that would have thrown at runtime.

### 4.5 Structural alignment — SAP-standard test location
Moved `app/webapp-test/` → `app/webapp/test/` (the actual SAP/UI5-tooling-standard, auto-served
location) — the test suite had never actually been runnable before this move. Found and fixed 1 real
product bug (`PayloadCompareUtils.compare()`) plus 5 stale tests.

### 4.6 Structural alignment — layer-first, single root Component
The larger reorganization: dissolved 19 separate lazy-loaded feature Components into **one root
Component** with top-level layer folders (`controller/<module>/`, `view/<module>/`, etc.) — matching a
plain single-view SAP Fiori scaffold's shape, generalized across features. ~250 files touched,
incremental with a verification gate after every module. Result: 0 Component targets, all View targets
in the root manifest; unit suite 367/367 at the time; backend suite 266/266 at the time.

### 4.7 The Universal CoE Framework (multi-session initiative, now fully shipped)

A second product initiative layered on top of the Operations Platform: a configuration/administration
framework for SAP's "CoE" (Center of Excellence) integration routing conventions — Partner Directory
agreement management, JMS/Common Router route creation wizards, and a rule-authoring tool for
disambiguating shared-partner routing. Built across several sessions; **this handoff's session covered
the second half of the list below** (from "Region + Priority Queue Builder" onward) — the earlier items
are included for completeness since they're load-bearing context for everything after them.

**Confirmed Partner Directory data model** (the foundation everything else reads/writes against):
- **JMS agreements**: string parameters under fixed registry PID `_Maintain_JMS_Agreements`, id
  `.{SNDPRN}.{RCVPRN}` (standard) or `.{MESTYP}.{SNDPRN}.{RCVPRN}` (specific); value = target Partner
  ID directly (no separate `Target_PID` reference parameter — an early assumption that was corrected).
- **Router agreements**: symmetric, under `_Maintain_Router_Agreements`.
- **Route key**: 6-part `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}`, `*` for any
  missing part; stored parameter Ids substitute `*`→`~` (CPI's `StringParameter` Id charset excludes
  `*`) via `toStorageKey`/`fromStorageKey` in `coe-router/service.ts`.
- **Ruleset escalation**: when a sender/receiver pair legitimately routes to more than one target, the
  plain agreement is deleted and replaced with a `RULESET_.{SNDPRN}.{RCVPRN}` entry holding a
  comma-separated candidate list; disambiguating between candidates at runtime requires a **Binary
  Parameter** rule (JSON, base64-encoded, `BinaryParameters` OData entity set — confirmed live; CPI
  rejects real MIME types for `ContentType`, only short tags like `json;encoding=UTF-8`) named after
  each candidate, under the same registry PID. Authoring those rules is the Rule Builder's job.

**Modules built (chronological, `coe-*` backend / `coe*` frontend naming)**:

1. **CoE Global Settings** (`coeAdmin`) — the four `.SYS_JMS_FRAMEWORK` global defaults
   (environment/retries/exception-mailbox/egress-URI), immutable display → explicit edit session →
   validate → confirm → publish.
2. **Route Creation** (`coeRouter`) — a Creation Hub (`NavContainer` housing 3 nested wizard flows,
   not 3 separate routes — see §3's gotcha): **Create JMS Entry**, **Create only Common Router**,
   **Create JMS + Common Router Connection**. Each is a `sap.m.Wizard`: paste/type an IDoc control
   record → check the agreement track (normal vs. ruleset, live against the real tenant) → configure
   target/queue/endpoint + advanced tabs (custom mapping, alerting, optimization) → deploy
   (best-effort, idempotent per-parameter upsert).
3. **Parameter Registry** (`coeRegistry`) — originally a flat PID→parameter-list CRUD screen; **this
   session redesigned it into a 3-box layout**: JMS/Router Agreements (read-only sender/receiver pair
   lookup, showing ruleset candidates + their rule-authored status) + General Search (the original
   PID-scoped listing, plus a new "Present In" reverse lookup — given a target PID, every agreement
   entry that routes to it).
4. **DLQ & Recovery** (`coeDlq`) — master-detail over MPL-derived failed messages; selecting one
   resolves its target JMS queue + shows error details; Replay is genuinely read-only (resolves a
   queue name for manual replay, since the CoE platform's actual re-injection endpoint isn't exposed
   by this SDK — confirmed by reading the backend, not assumed).
5. **Rule Builder** (`coeRuleBuilder`) — authors the Binary Parameter rules `RULESET_` entries
   reference. Two rule kinds: **Agreement Ruleset** (flat: identifying queries + target routing) and
   **X-Cast Endpoint Resolver** (nested if/else-if/else condition tree, flattened to editable rows with
   live tree mutation via a `Mutable<T>` recursive mapped type). Visual/Raw-JSON toggle. Deep-linked
   into from the route wizards' post-deploy "ruleset escalation" follow-up (`DeepLinkHelper`,
   base64url-encoded `state` query param — the established deep-link convention reused everywhere
   after this).

**This session's work, in order:**

6. **Region + Priority Queue Builder** — a small widget on the route wizards' Configuration step:
   Region (NA/LA/AS/EU/Hills) + Priority (P1/P2/P3) selects + a "Build Queue Name" button compose
   `Common_JMS_ID_{region}_{priority}` into the Target Architecture Queue field. Shared pure logic in
   `controller/coeRouter/queueBuilder.ts`.
7. **Parameter Registry 3-box redesign** (detailed above as item 3) — two design forks confirmed with
   the user before building: pair-lookup (not a browsable list) for the two agreement boxes; "Present
   In" scoped to just the two agreement registries, not a tenant-wide scan (architecturally the only
   feasible option — the Partner Directory has no cross-PID query capability). New backend read-only
   methods `lookupAgreement`/`presentIn` on `CoeRouterService`.
8. **Global Partner Master-Detail Dashboard** (`coePartnerDashboard`, new module) — a master list of
   every Partner ID discoverable by scanning both agreement registries (there's no tenant capability to
   enumerate every PID directly — General Search's "By Partner ID" mode remains the fallback for an
   arbitrary lookup), and a **reverse-engineered detail view** per partner: its raw
   `QUEUE_JMS_`/`ROUTE_JMS_`/`ROUTE_` parameters decoded back into structured routes (two new reverse
   parsers, `fromStorageKey`/`parseRouteKey`, added to `coe-router/service.ts`), everything else as
   flat parameters, and which agreements reference it.
9. **Deep-link-to-edit** (follow-up to item 8) — every decoded route got an "Edit" button that
   navigates into the matching creation wizard, pre-filled (including reconstructing the Advanced tab
   from the partner's flat parameters) and with the agreement check auto-run in the background — but
   never auto-deploying; the developer still reviews every step and clicks Deploy explicitly. Two
   design forks confirmed first: this level of automation, and — when a routeKey has both a JMS and a
   Router leg on the same Partner ID (an edge case) — preferring the Combined wizard over the
   single-purpose one. Required extending the Hub's route pattern with `:?query:` and a new
   `applyDeepLinkPrefill(state)` method on each of the 3 flow controllers, dispatched from
   `Hub.controller.ts`'s `onRouteMatched`.
10. **Dialog/confirmation consistency polish pass** — a full inventory of every `MessageBox`/`Dialog`
    across all 6 CoE modules (only one real custom `Dialog` exists — the Rule Editor). Fixed: 3
    ruleset-escalation warnings had no title (now share one); the combined wizard's warning had
    silently **lost** per-leg detail (fixed to show both legs' specific collision info); delete-confirm
    wording was inconsistent between two modules; the Rule Editor dialog had no busy state during save.
    Investigated and *deliberately left*: DLQ's Replay has no confirm (verified it's genuinely
    read-only, so a confirm would be a wrong fix); the shared `ErrorHandler`'s hardcoded/inconsistently
    cased titles and an unused shared `ConfirmDialog` fragment (both real, but out of scope — core
    infra, not CoE-specific).
11. **Deferred UI-verification pass on Admin/DLQ** (the final backlog item) — live walkthrough of both
    modules against the real tenant. No functional bugs; found and fixed one real bug class present in
    *both* modules: raw ISO timestamps rendered directly, bypassing the app's own documented
    `DateTimeFormatter` convention (used by ~14 other modules, but never adopted by any of the 6 CoE
    modules until now) — added `formatter/coeDlq/CoeDlqFormatter.ts` +
    `formatter/coeAdmin/CoeAdminFormatter.ts` and rewired both views. Also fixed a DLQ table row
    rendering fully blank cells for legitimately-empty tenant data (looked like a load failure) with a
    plain `'–'` fallback.

**As of the end of item 11, the CoE Framework backlog is empty.** Backend test suite: 348/348 (up from
266 at the start of this session — 82 new tests across the queue builder, Parameter Registry lookup
endpoints, Partner Dashboard, and the route-key reverse-parsing helpers). Frontend `tsc`/ESLint clean
throughout.

---

## 5. What was tried that failed (and the fix)

Preserved from the original handoff (still true), plus new entries from this session below the line.

| Attempted | Result | Fix |
|---|---|---|
| `git mv app/webapp-test app/webapp/test` | Failed — `app/` is entirely untracked, `git mv` had nothing to move | Plain `mv` / `cp -r` + `rm -rf` |
| Moving `webapp-test` while `ui5 serve` was watching `webapp/` | `mv`: `Permission denied` (Windows file lock) | `cp -r` then `rm -rf` instead of an atomic move |
| `BaseController.getRouter()` via `Component.getComponentById` | `Component.getComponentById is not a function` — declared in `@sapui5/types` but not actually present in the pinned UI5 1.120.0 patch served by the proxy | `Component.getOwnerComponentFor(oObject)` instead — available since 1.25.1 |
| Assuming JMS queue 501s meant a queue-naming mismatch | Wrong diagnosis, still 501'd after retry | Root cause was the entity set itself (`JmsQueues` doesn't work; `Queues` does) |
| `chrome --headless --dump-dom` for running QUnit headlessly | Empty file — doesn't wait for async completion | Drive Chrome via raw CDP, poll until done |
| **(this session)** Editing `config/features.json` while the backend was already running | New module silently redirected `#/home`, no console error | Backend `ConfigService` is a frozen-at-boot singleton — restart the backend process (see §2's gotcha box) |
| **(this session)** `kill -9 <pid>` against a PID from Git Bash's `ps aux` to restart the backend | Looked like it worked, but the real process was still holding the port; the new spawn crashed silently with `EADDRINUSE`, so the *old*, stale-config process kept serving requests | Found the true owning PID via PowerShell's `Get-NetTCPConnection -LocalPort 4004`, then `Stop-Process -Id <pid> -Force` |
| **(this session)** Generic `document.querySelectorAll('textarea')[0]`-style controller lookup in verify scripts, once more than one Creation Hub wizard flow had been opened in the same headless session | Silently drove the *wrong* wizard's controller (all 3 flows are simultaneously instantiated in the DOM, with identical local ids) — produced confusing "it didn't work" results that were actually a test-script bug, not a product bug | Always resolve by the specific flow's static id suffix (`[id$="routerOnlyFlow"]`) |
| **(this session)** Awaiting a controller's `void` fire-and-forget event-handler methods directly in verify scripts (`await ctrl.onSearch()`) | Read stale/`null` model state — the method returns before its internal async work finishes, matching the app's real UI5 press-handler convention (`void this.doAsyncThing()`) | Poll `/busy` true→false in the test script instead of awaiting the handler call |
| **(this session)** Case-sensitive string matching for toast/dialog text in a couple of verify scripts (e.g. searching for `"Correct"` when the actual i18n text said `"correct"` mid-sentence) | False-negative "bug" that wasn't real | Re-checked the actual i18n key value before concluding a test failure was a product bug — always verify the exact string before writing an assertion against it |

---

## 6. What's planned next

**Nothing is currently queued.** Two independent, both-genuinely-open threads exist:

**Thread A — CoE Framework**: fully shipped as of §4.7 item 11. No further CoE work has been
requested. If more comes up, the natural next candidates (mentioned in passing during this session but
not committed to) would be things like a tenant-wide search capability (would require a new SDK
provider capability — the Partner Directory has no cross-PID query today) or extending deep-link-to-edit
to the Rule Builder's own rules from the Partner Dashboard.

**Thread B — original Operations Platform roadmap** (scoped 2026-07-11, **not started**, work was
redirected to Thread A instead):

| Phase | Scope |
|---|---|
| 2 | **Message Monitoring**: filter-first UX, deeper MPL fields, client-side regex search. |
| 3 | **Recovery Center** gains a "Failed Messages" tab absorbing Message Replay's role (real retry counts + DLQ context); Message Replay retires once this ships. |
| 4 | **JMS Queues** becomes a real per-queue monitor: health score, tenant-wide broker capacity context. |
| 5 | **Runtime Center**: pre-filter the Integration Catalog; tighten tenant-wide-vs-per-flow caveats. |
| 6 | **Analytics** becomes a real dashboard (DB/JMS usage, top-failure iFlows) — no new SDK provider needed. |
| 7 | Resolve remaining placeholders (Alerts, Audit Trail, Roles, Integration Advisor, API Monitoring); wire the JMS Purge action. |
| 8 | Real CI test runner (`karma-ui5` or equivalent) instead of ad-hoc CDP scripts. |
| 9 | Production hardening: BTP CF deploy wiring verification, Administration's real connectivity check, i18n/accessibility passes. |

**Recommendation for whoever picks this up:** ask the user which thread (if either) to continue —
don't assume Thread B resumes automatically just because it's older; Thread A was the explicit focus
for multiple consecutive sessions and may not be "done for good" from the user's perspective even
though its stated backlog is empty.

---

## 7. Current state and design of the app

### High-level architecture

```
Browser (SAPUI5 + TS, single root Component, layer-first)
   │  fetch → BaseService → ApiClient
   ▼
Node/Express backend (srv/) — /api/v1/<module>
   │
   ▼
Operations Engine (srv/src/operations) — composed business-logic layer
   │  MessageEngine · RuntimeEngine · QueueEngine · CertificateEngine · NotificationEngine ·
   │  StatisticsEngine · RecoveryEngine · RuntimeCenterEngine · CertificateSecurityEngine ·
   │  PartnerDirectoryEngine (backs every coe-* module)
   ▼
Integration Suite SDK (srv/src/sdk) — one IXxxProvider interface per domain,
   │  Real*Provider (live OData/REST against the tenant) or Mock*Provider (MockEngine, scenario-driven)
   ▼
SAP Integration Suite (real trial tenant) — OData v2, various entity sets (MessageProcessingLogs,
   IntegrationRuntimeArtifacts, KeystoreEntries, Queues/MessagingQueues/MessagingMessages, DataStore,
   StringParameters, BinaryParameters, …)
```

### Frontend (`app/webapp/`) — layer-first, single root Component

```
webapp/
  Component.ts, manifest.json, index.html, index.ts     — the one root Component
  controller/<module>/   view/<module>/   model/<module>/
  service/<module>/      formatter/<module>/  config/<module>/
  fragment/<module>/     css/<module>/   i18n/<module>/i18n.properties
  core/                  — framework layer: base classes, services, formatters, utils, errors, events
  shell/                 — global chrome: ToolPage shell, registry-driven nav, notifications
  library/               — reusable custom controls + shared fragments
  test/                  — QUnit unit + OPA5 integration tests (SAP-standard location)
```
Full detail: `app/STRUCTURE.md`. **21 feature modules** (15 Operations Platform + 6 CoE Framework);
`core`/`shell`/`library` deliberately stay cohesive (framework/chrome, not features). No OData model on
the frontend — `JSONModel` + custom fetch services throughout.

**Two conventions worth knowing before touching any module** (both cost real debugging time this
session when violated):
- **i18n is per-module and never inherited.** `Component.ts`'s `applyModuleI18n` derives the module id
  from the view name and attaches `i18n/<module>/i18n.properties` as that view's `"i18n"` model — a
  view can *only* resolve `{i18n>key}` bindings from its own module's bundle. Referencing another
  module's key (e.g. `coeRegistry`'s view using `{i18n>coeRouter.field.sndprn}`) silently renders the
  literal key string, no error. Happened twice this session (Parameter Registry, Partner Dashboard) —
  fixed by duplicating the handful of shared field-label keys into each module's own bundle.
- **Timestamps always go through `core/formatters/DateTimeFormatter`**, never bound raw. The pattern:
  a `formatter/<module>/<Module>Formatter.ts` class delegating to it, a thin public wrapper method on
  the controller (`public formatDateTime(value) { return XFormatter.dateTime(value); }`), and the view
  binds via `{ path: '...', formatter: '.formatDateTime' }`. ~14 modules already did this; none of the
  6 CoE modules had until this session's Admin/DLQ pass (§4.7 item 11).

### Backend (`srv/src/`)

- `modules/<kebab-case>/` — one Express router + controller + service + DTOs per feature, mounted in
  `srv/src/routes/index.ts`. Thin: parse request → call the Operations Engine → shape the DTO. 21
  modules total, mirroring the frontend 1:1 (15 Operations Platform + `coe-admin`, `coe-router`,
  `coe-registry`, `coe-dlq`, `coe-rule-builder`, `coe-partner-dashboard`).
- `operations/` — the composed business-logic engines, plus the DTO layer every module consumes.
  `OperationsEngine` is the single composition root.
- `sdk/` — the Integration Suite SDK: `providers/Real*` (live tenant calls), `providers/Mock*`
  (scenario-driven fixtures via `MockEngine`), `client/`, `odata/`, `rest/`, `pipeline/`, `errors/`.
  `PartnerDirectoryClient`/`RealPartnerDirectoryProvider` (added for the CoE Framework) cover both
  `StringParameters` and `BinaryParameters`, with a full CSRF-handshake write path — the first SDK
  surface in this project that writes to the tenant beyond JMS message actions.
- `config/` — `ConfigService` reads `config/*.json` **once at process boot, frozen for the process
  lifetime** (see §2's restart gotcha) — `connectivity.json` (real-vs-mock provider mode),
  `features.json` (module enablement), `queues.json`, `tenants.json`.

**Module-boundary convention**: no backend module ever imports a sibling module's `service.ts`
singleton — only pure constants/functions cross module boundaries (e.g. `coe-partner-dashboard`
imports `JMS_AGREEMENTS_PID`/`fromStorageKey` from `coe-router`, never `coeRouterService` itself).
Consistently followed across all 6 coe-* modules.

### Permissions

`PermissionEngine` + `RoleCollections.ts` (XSUAA-scope-based) gate both UI visibility (`RouteGuard`,
`NavigationService`) and backend write actions (`requireScope(...)` middleware). Most CoE modules are
**generally visible, no permission gate** (per the original spec's "developer/operational tiles"
framing) except `coeAdmin`, which requires `Administration.Manage` like the original Administration
module.

### Data-honesty convention (applies everywhere, both initiatives)

Every DTO field is one of three things, and the code/docs say which: **real** (read straight from a
live SDK provider), a **documented heuristic** (computed from real fields, explicitly labeled as an
approximation), or a **reserved extension point** (no data source exists yet; rendered as
`undefined`/empty with a reason, never invented). Enforced by convention and by review throughout —
e.g. DLQ's Replay reporting `executed: false` rather than pretending to dispatch a message it can't
actually re-inject.

### Testing

- **Backend**: `srv/test/` (`node:test` via `tsx`), run with `npm test` inside `srv/`. **348/348
  passing** as of this handoff (verified fresh, just now). Occasional flake observed once in ~10 runs
  during this session in an unrelated pre-existing test, unreproducible — not traced to any change made
  this session.
- **Frontend**: `app/webapp/test/` (QUnit unit + OPA5), SAP-standard location, runs in-browser via the
  dev server. **Not re-run this session** (`tsc`/ESLint were used for the CoE work instead, plus live
  CDP verification against the real tenant for every feature) — last known count from the 2026-07-11
  handoff was 367/367; re-run before trusting that number now that 6 new modules + 21 total exist. No
  CI runner wired yet (old Phase 8).

### Deployment target (not yet exercised end-to-end)

BTP Cloud Foundry via `mta.yaml`, with `approuter/` and `xs-security.json` present in the repo. Still
not deployed or verified in any session to date — old Phase 9.
