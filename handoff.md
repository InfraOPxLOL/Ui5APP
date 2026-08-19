# Handoff — Integration Portal

**Last updated:** 2026-08-09
**Author of this handoff:** Claude (agentic session), for whoever picks this up next (human or AI).
**Supersedes:** the 2026-07-22 handoff. That version ended with two open threads (Message Monitoring
JMS retry + CoE Rule Builder/wizards, §4.8). **This session (2026-08-03) fixed three Message Monitoring
UX bugs and consolidated the CoE workspace from 6 sidebar entries to 3** (§4.9) — see that section for
the full writeup (already present in this document; this update just brings the surrounding sections
and git-state banner below up to date, since they still described the pre-§4.9/pre-git state).

> **Git state (corrected 2026-08-09 — the previous version of this banner was stale).** The repo now
> has a real commit history and a GitHub remote: `origin` → `https://github.com/InfraOPxLOL/Ui5APP.git`.
> Working branch **`feature-monitoring-Improvements`** is clean and pushed, tracking
> `origin/feature-monitoring-Improvements`. (The "nothing is committed beyond the bare scaffold"
> warning that used to be here is no longer true — do not assume an uncommitted working tree without
> checking `git status` first.)
>
> **Getting the code into SAP Business Application Studio**: clone from the GitHub remote inside a
> **"Full Stack Cloud Application"** dev space (matches this repo's `mta.yaml`/`xs-security.json`/
> `approuter/` — CF CLI + MBT + Node.js preinstalled), `git clone -b feature-monitoring-Improvements
> https://github.com/InfraOPxLOL/Ui5APP.git`, then `npm install` at the repo root (workspaces monorepo,
> one install covers `app`/`srv`/`approuter`). `.env` is gitignored and won't come across in the clone —
> recreate it by hand in the dev space using the same values as local (see the "Fresh-clone setup"
> paragraph below); never paste real secret values into chat.

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
  complete**. The old Thread-B roadmap (§6) is still mostly untouched, **except Message Monitoring**,
  which was reworked into a genuine JMS-retry + top-filter tool with a routed detail page (§4.8-A),
  then had two more UX bugs fixed (Advanced Search close, filter layout — §4.9) — the first roadmap
  item actually delivered.
- A second, later initiative — the **Universal CoE Framework** (6 modules layered on top of the same
  platform: Global Settings, Route Creation, Parameter Registry, DLQ & Recovery, Rule Builder, Partner
  Dashboard) — was scoped, built, and iterated across multiple sessions. Its original backlog shipped
  in the 2026-07-15 session; it was then extended with two Rule Builder bug fixes and a new inline
  "Disambiguation Rule" step in all three route-creation wizards (§4.8-B), and **most recently
  consolidated from 6 sidebar entries down to 3** — Partners & Routes (tabbed), DLQ & Recovery, CoE
  Global Settings — via a compose-not-rewrite tabbed shell, on explicit user direction to reduce
  cross-module jumping (§4.9). All 6 underlying modules are unchanged and still fully live; only the
  navigation surface changed.

**What's next is genuinely open** — see §6. The user has been driving feature-by-feature
(Message Monitoring retry → Rule Builder fixes → wizard rule step → Message Monitoring UX fixes → CoE
workspace consolidation), each confirmed via `AskUserQuestion`/plan-mode at the point of ambiguity.

---

## 2. Current state of the UI

**Both dev servers were up and used for live verification throughout this session:**

| Server | Port | Verified |
|---|---|---|
| Backend (`srv`, `npm run start:dev`, tsx watch) | `:4004` | Real tenant data flowing; all §4.8 features live-verified against it and test artifacts cleaned up |
| Frontend (`app`, `ui5 serve`) | `:8080` | `GET /index.html` → `200`. **Note:** the user has also run a second `ui5 serve` on `:8081` in their own browser — if a fix "isn't taking", confirm which port they're on and hard-refresh (SPA; already-loaded JS doesn't hot-swap). Also: `ui5 serve` fetches the SAPUI5 framework live from `https://ui5.sap.com` (per `ui5.yaml`), so "local" dev still needs internet. |

**Fresh-clone setup** (a `.env` at repo root is the one gitignored thing you must recreate — it holds
the trial tenant's OAuth secret): `npm install` → create `.env` with `CPI_PRIMARY_CLIENT_ID`/
`CPI_PRIMARY_CLIENT_SECRET`/`JMS_QUEUE_DISCOVERY_MODE=Fetch_All` → `cd srv && npm run start:dev`
(tsx-watch, no build needed) + `npm run start:app`. Node ≥ 20 / npm ≥ 10; no Java/CF CLI needed for
local dev. Set `config/connectivity.json` `mode: "mock"` to run with seeded data and no `.env` at all.

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
- **CoE Framework** (6 modules, the `Workspaces.CoE` workspace, all `enabled:true` in
  `config/features.json` and all **fully live** against the real tenant): as of §4.9, the sidebar shows
  only **3 entries** — `Partners & Routes` (a tabbed shell embedding `Route Creation`, `Parameter
  Registry`, `Rule Builder` and `Partner Dashboard` as nested, unmodified views — see §4.9), `DLQ &
  Recovery`, `CoE Global Settings`. All 6 module routes still exist and are independently reachable
  (`showInSidebar:false` on the 4 merged ones, not `enabled:false`), so deep links into any of them
  still work. This is the only workspace with **zero** placeholder screens.

**Data-honesty status per screen:**

| Fully live | Partially live | Still placeholder |
|---|---|---|
| Dashboard, **Message Monitoring** (now incl. real JMS retry — §4.8-A), Payload Studio, Recovery Center, Runtime Center | Message Replay (no real retry count), JMS Queues (Purge action not wired to a button), Certificate & Security Center (Security Materials mostly unavailable), Administration (connectivity status always "UNKNOWN") | Alerts, Audit Trail, Roles, Integration Advisor, Analytics, API Monitoring |
| **All 6 CoE Framework modules** (Global Settings, Route Creation + its 3 wizards, Parameter Registry, DLQ & Recovery, Rule Builder, Partner Dashboard) | | |

The remaining Operations Platform placeholder/partial screens are unchanged. This session's movement
was **Message Monitoring** (Thread B) plus **Rule Builder / Route Creation** (Thread A) — see §4.8.

---

## 3. Files currently being worked on

**None mid-edit.** The last completed unit of work (§4.8-B — the Rule Builder static-inheritance fix
after the user hit `RuleBuilderController.buildRule is not a function` on a valid save, then the inline
wizard rule step) was fully live-verified and memory notes written. No in-progress edit to resume.

Two plans were run through plan-mode this session (Message Monitoring JMS retry, then the wizard rule
step) — both approved, executed, and now complete. The plan file
`~/.claude/plans/toasty-coalescing-pelican.md` currently holds the (finished) wizard-rule-step plan.

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

**As of the end of item 11, the CoE Framework backlog was empty.** Backend test suite: 348/348 at that
point. Frontend `tsc`/ESLint clean throughout.

### 4.8 This session (2026-07-22)

Two independent feature streams, both live-verified against the real tenant, both fully cleaned up
after testing. Backend suite ended at **356/356** (348 + 8 new JMS-retry tests); frontend QUnit
**131/131**; `tsc`/ESLint clean both sides.

#### 4.8-A Message Monitoring — real JMS retry + top-filter layout + routed detail page

The old Message Monitoring "Retry" action was a stub that just deep-linked to JMS Queues and retried
nothing. Reworked into a real capability driven entirely by unfabricated tenant data (all confirmed
against `$metadata.xml`, not assumed):

- **Real custom-header reads**: `MessageEngine.getMessage()` hardcoded `customHeaders: {}`. Wired the
  live `MessageProcessingLogs('id')/CustomHeaderProperties` nav property through a new
  `IMonitoringProvider.getCustomHeaders` (Real + Mock). First real use of that nav property.
- **JMS classification + retry resolution** (`srv/src/modules/message-monitoring/service.ts`): a
  message is JMS-retryable iff its correlation group (via the existing `findByCorrelationId`) contains
  the two **literal, fixed bridge iFlows `IF_JMS_ingress` and `IF_JMS_egress`** (user-confirmed names).
  The target queue is parsed from the ingress entry's own `CH-Message-Queue` custom header — real value
  format `📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]`,
  parsed via `/\[[^[\]]*=\s*([^\]]+)\]\s*$/`. Presence is checked with a new **keyed** JMS lookup
  (`IJmsProvider.getMessage`, composite key `(jmsMessageId, queueName)` — cheaper/honester than the old
  scan-every-queue pattern), first on the resolved queue, then the fixed central DLQ `Common_JMS_ID_DLQ`.
  Five business-rule constants live at the top of that service file — **change them there** if the
  tenant's iFlow/queue/header naming differs.
- **Cost control**: classification is split cheap (`checkJmsEligibility`, list-toggle-facing, one
  correlation-group fetch) vs. expensive (`getRetryCheck`, header + up to 2 keyed queue reads,
  retry-button-facing) — deliberately not run eagerly per row.
- **Real retry execution**: `QueueEngine.retryMessage` → `JmsClient.retryMessage` → the tenant's
  `RetryMessagingMessages` action. New routes: `GET /:id/jms-eligibility`, `GET /:id/retry-check`,
  `POST /:id/retry` (the POST gated `requireScope("MessageReplay.Execute")`, same as every other retry
  route).
- **Frontend layout rework** (`view/messageMonitoring/List.view.xml` + controller): filter bar moved to
  a **top bar** (quick search + Advanced Search toggle + JMS/Non-JMS `SegmentedButton`), full-width
  multi-select grid, row actions (View Details / Retry / Download), single + bulk retry with a
  per-item results dialog (`fragment/messageMonitoring/BulkRetryResultsDialog`), permission-gated bulk
  button. Retry confirm dialogs follow the CoE `MessageBox.confirm → busy → toast` idiom.
- **Routed detail page**: `#/messageMonitoring/{mplId}` (manifest pattern `messageMonitoring/:mplId::?query:`
  — UI5 1.120 optional-path-param syntax, **now verified working live**, was previously flagged
  unverified). Reuses the same route name (no new `NavigationService` wiring), embeds `DetailDrawer`
  full-page, and appends a 4th, message-level breadcrumb via the pure `controller/messageMonitoring/DetailBreadcrumb.ts`
  (unit-tested — `test/unit/DetailBreadcrumbTest.qunit.js`; caught a real A→B-navigation crumb-accumulation
  bug the live click-through missed). "Expand" now navigates here instead of opening a Dialog.

#### 4.8-B Rule Builder bug fixes + inline "Disambiguation Rule" wizard step

Two real Rule Builder bugs the user hit, then a feature:

- **X-Cast structural edits were completely dead** — every add-nested-if / else-if / else / remove
  button read the flattened *row-view wrapper* (`{depth, node, isRoot, canRemove}`) instead of its
  `.node`, so `node.nodeType` was `undefined` and they all silently no-op'd (field edits worked because
  they bind through `node/…`). Fixed with a `rowNode()` unwrap.
- **"Request validation failed" on save** was *correct* backend validation on an empty required field,
  opaquely reported. Fixed with client-side pre-submit checks naming the exact field + `valueState`
  markers, **and** a global `ErrorHandler` enhancement (`ErrorHandler.validationHint`) that appends the
  failing zod field path to any VALIDATION-kind error app-wide.
- **Feature — inline rule authoring during route creation** (user chose: dedicated wizard step, full
  editor, both kinds). The editor was extracted for reuse: ~15 handlers + build/validate/apply/flatten/
  locate helpers moved into a shared base `controller/coeRuleBuilder/RuleEditorHost.controller.ts`
  (operating on a standard `view>/ruleEditor` slice — the Rule Builder was **migrated** from `/editor`);
  the editor UI moved into `view/coeRuleBuilder/RuleEditorContent.fragment.xml`; state types live in
  `model/coeRuleBuilder/RuleEditorState.ts`. `RuleBuilderController` and `CreationFlowController` both
  now `extend RuleEditorHostController`, so all 3 wizards inherit the editor. Each wizard gained a
  "Disambiguation Rule" `WizardStep` (before Review) that auto-enables + pre-fills from a detected
  ruleset collision (registry PID from `check.agreementStorePid`, candidate name/routing from the route),
  and saves the authored rule via `RuleBuilderService` after the route deploy creates the `RULESET_`
  entry. Full detail: memory notes [[coe-visual-rule-builder]], [[coe-creation-hub]].

### 4.9 UX pass: Message Monitoring fixes + CoE workspace consolidation (2026-08-03)

**Message Monitoring**
- **Advanced Search would open but never close** — root cause was a bug introduced by an earlier
  "fix" in this same session: `sap.m.ToggleButton`'s `press` carries **`pressed`**, not `state`
  (`state` belongs to `sap.m.Switch`'s `change`). Reading the wrong name yields `undefined`, and
  assigning `undefined` to a UI5 boolean property **resets it to its default** — `visible` defaults
  to `true`, so the panel could never hide. The same bug had silently pinned the density toggle to
  "compact"; both fixed.
- **Filter layout compacted** — the criteria moved from 14 stacked full-width rows into a responsive
  4/3/2-column `SimpleForm`/`ColumnLayout`: panel height **403px (was ~590px+)**, fields ~350px, 4
  rows. Saved-search load/delete moved into a compact `Select` + delete button.
- **Target PID type-ahead** on all three wizards, from
  `CreationFlowController.loadPartnerSuggestions()` → `GET /api/v1/coe-partner-dashboard`. Kept a
  free-text `Input` with `showSuggestion` rather than a `Select`, because the PID list is *derived*
  from the agreement registries — a partner being onboarded right now is legitimately absent, and a
  closed list would make it un-enterable.

**CoE workspace: 6 sidebar entries → 3** (`coePartnersRoutes`)
New tabbed shell `view/coePartnersRoutes/PartnersRoutes.view.xml` + controller. Sidebar is now
**Partners & Routes · DLQ & Recovery · CoE Global Settings**. Entry is partner-first: partner list →
that partner's decoded routes → "New Route" opens the Creation Hub in place ("Back to Partners"
returns).

*Compose, don't rewrite* — the tabs embed the **existing, unmodified** Partner Dashboard, Route
Creation Hub, Parameter Registry and Rule Builder views as nested `<mvc:XMLView>`. No logic changed
in those four modules, so wizards/ruleset escalation/inline rule editor/deep-link-to-edit all kept
working. Reuse this pattern for future merges.

Three mechanisms made it safe, all live-verified:
1. **Nested-view i18n** — `Component.applyModuleI18n` only fires for *routed target* views, so
   nested views would silently render raw `{i18n>…}` keys. Extracted the bundle build+cache to
   `core/utils/ModuleI18n.ts` (`getModuleI18nModel`), applied per nested view by the shell's
   `applyNestedI18n()`. **Not** solved by duplicating keys.
2. **Deep links preserved** — all four original route names kept and simply *retargeted* to the one
   shell target in `manifest.json`; the shell's `onRouteMatched` selects the tab. Because
   `attachPatternMatched` binds to the **route, not the view**, the nested controllers' own handlers
   still fire (verified: wizard→Rule Builder opens the editor pre-filled with pid+ruleName; Partner
   Dashboard→wizard prefills targetPid/sndprn).
3. **Sidebar hiding** — `showInSidebar:false` in `WorkspaceCatalog.ts`
   (`isModuleVisible = showInSidebar && isModuleAuthorized`) hides the entry while keeping the route
   authorized; the merged modules therefore stay `enabled:true` in `config/features.json`.

Gates after this pass: backend **356/356**, frontend QUnit **131/131**, `tsc`/ESLint clean. No test
artifacts left on the tenant (rule list empty, partner list unchanged at 7).

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
| **(2026-07-15)** Case-sensitive string matching for toast/dialog text in a couple of verify scripts (e.g. searching for `"Correct"` when the actual i18n text said `"correct"` mid-sentence) | False-negative "bug" that wasn't real | Re-checked the actual i18n key value before concluding a test failure was a product bug — always verify the exact string before writing an assertion against it |
| **(2026-07-22)** Referencing an inherited `protected static` method through the **subclass** name (`RuleBuilderController.buildRule`, where `buildRule` is defined on the base `RuleEditorHostController`) | tsc accepted it, but at runtime the transpiled UI5 class output does **not** carry statics through the subclass name → `RuleBuilderController.buildRule is not a function` on Save. (The wizards worked because they reach it via an instance helper that uses the defining-class name internally.) | Always call an inherited static via the **defining** class name (`RuleEditorHostController.buildRule`), or wrap it in a `protected` instance method on the base |
| **(2026-07-22)** Regression-testing the Rule Builder Save with only the *empty-field* path | The empty-field path returns at the validation guard **before** `buildRule` runs, so it never exercised the broken static call — the "green" regression missed the bug the user then hit on a valid save | When a method has an early-return guard, test the path that goes **past** it; a valid, complete save is a distinct code path from a blocked one |
| **(2026-07-22)** Message Monitoring's Advanced Search button "not opening" after two prior fixes | Real cause was neither fix: moving the filter bar from `headerContent` into the page `<content>` put it **under the page-level busy overlay** (`busy="{view>/grid/busy}"` on the `Page`), which swallows clicks page-wide during every grid refresh | Scope the busy indicator to just the grid pane (`busy` on the grid `VBox`, not the `Page`) so the top bar stays interactive while the grid loads |
| **(2026-07-22)** The collapsible Advanced Search panel rendered but showed nothing | CSS flexbox: the panel has `overflow:auto`, which makes its flex min-size `0`; its `flex-grow:1` sibling (the results Splitter) then squeezed it to **`height:1px`** — "visible" but invisible | Give the panel (and top toolbar) explicit `FlexItemData shrinkFactor="0"` so only the Splitter flexes |
| **(2026-07-22)** A `sap.m.ToggleButton` press handler reading `event.getParameter("pressed")` | Wrong param name — returns `undefined`; the toggle silently did nothing. The codebase's own `onDensityChange` (same control type) already used the correct name | ToggleButton press fires with `state` (not `pressed`) — `event.getParameter("state")` |
| **(2026-07-22)** Embedding the shared Rule-editor fragment (keys `coeRuleBuilder.*`) inside a coeRouter wizard step | i18n is per-module and never inherited — `getText`/`{i18n>…}` resolve against the *active view's* bundle, so ~35 editor keys rendered as raw key literals in the coeRouter module | Duplicated the editor keys verbatim into `i18n/coeRouter/i18n.properties` (both the fragment bindings and the host controller's `getText` messages). If you change an editor label, update **both** bundles |
| **(2026-08-03)** Reading a `sap.m.ToggleButton` press as `event.getParameter("state")` (copied from `onDensityChange`, which was itself already broken this way) | `state` is `sap.m.Switch`'s parameter, so this returns `undefined`; assigning `undefined` to a UI5 boolean property **resets it to its default**, and `visible` defaults to `true` — so the Advanced Search panel opened and could **never** close, and the density toggle was permanently "compact" | ToggleButton press carries **`pressed`**: `event.getParameter("pressed") === true`. Verify the actual event parameter in `@sapui5/types` rather than copying a neighbouring handler |
| **(2026-08-03)** Putting an `HBox` inside `form:content` of a `SimpleForm`/`ColumnLayout` (to group two duration fields on one row) | `Element sap.m.HBox is not a valid Form content!` — thrown at render, which killed the **entire** form, so the whole Advanced Search panel silently failed to appear (easy to misdiagnose as a data/visibility problem) | Only controls implementing `sap.ui.core.IFormContent` may be form content (`Input`, `Select`, `CheckBox`, `StepInput`, `DateTimePicker`, …). Move layout containers **outside** `form:content` |
| **(2026-08-03)** Assuming a nested `<mvc:XMLView>` would get its own module i18n bundle | `Component.applyModuleI18n` is bound to `router.attachRouteMatched` and only ever sees the *routed target* view, so nested views inherit the host's bundle and render raw `{i18n>…}` keys with no error | Extracted `core/utils/ModuleI18n.getModuleI18nModel(moduleId)` and applied it explicitly per nested view in the hosting controller (`PartnersRoutes.applyNestedI18n`) |

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
| 2 | **Message Monitoring**: filter-first UX ✅ (top bar + Advanced Search toggle shipped §4.8-A), real JMS retry ✅, routed detail page ✅. Still open: deeper MPL fields, client-side regex search. |
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

- **Backend**: `srv/test/` (`node:test` via `tsx`), run with `npm test` inside `srv/`. **356/356
  passing** as of this handoff (348 + 8 new JMS-retry tests: header parsing, eligibility classifier,
  keyed queue lookup). Occasional rare flake in an unrelated pre-existing test, unreproducible.
- **Frontend**: `app/webapp/test/` (QUnit unit + OPA5), SAP-standard location, runs in-browser via the
  dev server (there is **no headless CI runner** — old Phase 8 — so it's driven via a raw-CDP script
  that loads `test/unit/unitTests.qunit.html` and reads `#qunit-testresult`). **131/131 this session**
  (added `DetailBreadcrumbTest`). New unit tests only cover *pure, framework-free* logic (the codebase
  has no precedent for testing a full MVC controller); everything stateful is verified via live CDP
  against the real tenant instead. Note: the 2026-07-15 "367/367" figure predates the layer-first
  refactor's test consolidation — 131 is the current real count.

### Deployment target (not yet exercised end-to-end)

BTP Cloud Foundry via `mta.yaml`, with `approuter/` and `xs-security.json` present in the repo. Still
not deployed or verified in any session to date — old Phase 9.
