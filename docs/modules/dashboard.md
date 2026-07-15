# Operations Workspace (Phase 8)

The **command center** for SAP Integration Suite operators — the landing module of the Operations
workspace. It answers, at a glance: *Is the tenant healthy? What needs my attention now? What
changed recently? What should I do next?* — not a table dump, but an investigation-first operations
center in the spirit of Datadog / Grafana / CloudWatch, expressed through SAP Fiori controls.

## Architecture — consumes only the Operations Engine

```
Operations Workspace (this module)
   ↓ HTTP: GET /api/v1/operations/{overview,search}
Operations module (srv/src/modules/operations)   ← composes the DTOs
   ↓
Operations Engine (srv/src/operations, Phase 6)   ← the only business layer
   ↓
Integration Suite SDK → SAP Integration Suite
```

The UI **never** talks to the SDK, never knows an Integration Suite endpoint, never sees OData. It
consumes only Operations DTOs ([`service/OperationsTypes.ts`](service/OperationsTypes.ts)) via
[`OperationsOverviewService`](service/OperationsOverviewService.ts). The backend `operations` module
is where the Phase-6 Operations Engine is finally wired to a route (the wiring Phase 6 deferred);
`OperationsService.getOverview()` fans out across the engine and returns one aggregated overview.

## Layout (§1)

A `sap.f.DynamicPage` gives a **sticky** workspace header/toolbar and a pinnable header:

| Region | Contents |
|---|---|
| Title (sticky) | Workspace title, tenant + environment indicators, global operations search, statistics-window select, favorite toggle, and live-refresh controls (manual / auto / pause). |
| Header (pinnable) | Environment ribbon (§10) and quick-insight KPI chips (§2). |
| Content | A responsive `sap.ui.layout.Grid` of collapsible sections. |
| Footer | Last-updated timestamp and active window. |

## Overview sections (§2, §4)

Each section is a `sap.m.Panel` supporting **collapse/expand** (built-in), **refresh**, **fullscreen**
and — where data is tabular — **CSV export**. Sections:

- **Tenant & Runtime Health** — the health widgets (§3).
- **Quick Actions** — metadata-driven operational shortcuts (§5).
- **Top Active Interfaces** — interface summary cards (§9).
- **Operations Timeline** — recent failures/recoveries/deployments/alerts/queue events (§8).
- **Most Recent Failures** — the latest failed messages, severity-highlighted.
- **System Status** — active alerts.

## Reusable components (§11)

The data-driven widgets are **reusable XML fragments** in
[`../../library/fragments/`](../../library/fragments/), each bound to a standardized `view>/…`
model shape and the controller handlers below. Any future workspace that provides the same model
shape + handlers reuses them unchanged:

| Fragment | Binds | Purpose |
|---|---|---|
| `EnvironmentRibbon` | `view>/environment` | Environment-awareness banner (§10). |
| `QuickInsightsStrip` | `view>/overview/quickInsights` | KPI chips / SummaryWidget (§2). |
| `HealthWidgetGrid` | `view>/overview/health` | Health widgets (§3). |
| `InterfaceSummaryGrid` | `view>/overview/topInterfaces` | Interface cards (§9). |
| `OperationsTimeline` | `view>/overview/timeline` | Filterable timeline (§8). |
| `QuickActionPanel` | `view>/quickActions` | Quick actions (§5). |
| `OperationsSearchResults` | `view>/search/result` | Aggregated search results (§6). |

The **section container** is the `sap.m.Panel` + header-toolbar pattern used in the view (collapse /
refresh / fullscreen / export), so any section reuses it by repeating the pattern.

## Health widgets (§3)

Six dimensions — `tenant`, `runtime`, `deployment`, `queue`, `certificate`, `alert` — each exposing
health, status text, severity, value/total, description and a **recommended action**. The composite
`tenant` widget rolls up the worst of the rest. Pressing a widget drills into its module.

## Timeline (§8)

Aggregates recent failures, **recoveries** (a correlation id with both a failure and a later
completion), deployments, alerts, runtime errors, queue pressure and certificate expiries — all from
real Operations Engine data, newest-first, capped. A `SegmentedButton` filters by kind (client-side
`sap.ui.model.Filter`).

## Live refresh (§7)

[`Dashboard.controller.ts`](controller/Dashboard.controller.ts) integrates refresh: manual refresh,
auto-refresh on a config-driven interval (`refresh.intervals.dashboardMs`), pause/resume, a
refreshing indicator and a relative "updated Xm ago" timestamp. In-flight requests are aborted on
supersede and on `onExit`. A tenant switch (Phase 7 `TenantContext`) reloads the whole workspace.

## Search (§6)

The workspace search calls `/api/v1/operations/search`, which the Operations Engine resolves across
messages, queues, certificates and runtime artifacts, and renders the hits under tabs; each hit
opens its module.

## Environment awareness (§10)

The controller stamps `opsEnv-<kind>` on the view root; [`css/operations.css`](css/operations.css)
maps each kind to an accent (PROD red, QA orange, TEST blue, DEV green) applied to the ribbon and
header — DEV/TEST/QA/PROD are never confused.

## Accessibility & motion (§12, §13)

Fiori controls provide keyboard navigation, ARIA and screen-reader support; tiles/cards are
focusable and pressable. All motion (fade-in, hover lift) is subtle and disabled under
`prefers-reduced-motion`. The layout is fully responsive (XL/L 2-up → M/S 1-up) and honours compact
density.

## Tests (§14)

- Backend: [`srv/test/unit/operations/operationsModule.test.ts`](../../../../srv/test/unit/operations/operationsModule.test.ts)
  exercises the overview composition and search against a mock-mode Operations Engine.
- Frontend: [`OperationsFormatterTest.qunit.js`](../../test/unit/OperationsFormatterTest.qunit.js)
  covers the pure health/severity/timeline/time formatters.
