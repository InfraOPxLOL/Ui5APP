# Message Investigation Workspace (Phase 9)

The command center middleware engineers spend most of their day in — an **operational investigation
tool**, not a monitoring table. Every design decision optimizes for answering an operational question
("what failed, why, and what do I do next?") in the fewest possible clicks, not for displaying data.

## Architecture — consumes only the Operations Engine

```
Message Investigation Workspace (this module)
   ↓ HTTP: GET /api/v1/message-monitoring/{,:. id,:id/related,:id/context,export}
Message Monitoring module (srv/src/modules/message-monitoring)   ← composes the DTOs
   ↓
Operations Engine (srv/src/operations, Phase 6)   ← the only business layer
   ↓
Integration Suite SDK → SAP Integration Suite
```

The UI **never** talks to the SDK, never knows an Integration Suite endpoint, never sees OData —
only the rich `MessageMonitoringItem`/`MessageDetail`/`MessageContext`/`RelatedMessageGroup` DTOs
([`service/MessageInvestigationTypes.ts`](service/MessageInvestigationTypes.ts)), fetched through
[`MessageMonitoringService`](service/MessageMonitoringService.ts). This phase replaced the Phase-1
placeholder backend service (`emptyPage`) with a real implementation built on the Phase-6 Operations
Engine — the exact "future phase's module services call this" moment that engine's own doc comments
anticipated.

## Workspace layout (§ Workspace Layout)

A resizable `sap.ui.layout.Splitter` (nested: horizontal row inside a vertical splitter) arranges:

| Pane | Contents |
|---|---|
| Left | [Advanced Search Panel](fragment/AdvancedSearchPanel.fragment.xml) |
| Center | [`InvestigationGrid`](../../library/controls/InvestigationGrid.ts) toolbar + grid |
| Right | [Context Panel](fragment/ContextPanel.fragment.xml) |
| Bottom | Expandable [Detail Drawer](fragment/DetailDrawer.fragment.xml) |

Pane collapsed/expanded state is remembered for the session via
[`PanelLayoutService`](service/PanelLayoutService.ts) (in-memory, like every other session-only
service in this codebase — see Bookmarks below).

## Message Table (§ Message Table)

[`InvestigationGrid`](../../library/controls/InvestigationGrid.ts) is a new reusable control built on
`sap.ui.table.Table` (a project dependency since Phase 1) rather than the simpler `sap.m.Table`-based
[`ConfigurableTable`](../../library/controls/ConfigurableTable.ts) that plain list modules use —
`sap.ui.table.Table` natively virtualizes rows and supports column pinning/reordering/grouping that
`ConfigurableTable`'s domain has no use for. Declared as data via
[`config/columns.ts`](config/columns.ts) (`InvestigationTableDefinition`), exactly like every other
table-driving config in this codebase.

| Capability | Implementation |
|---|---|
| Virtual scrolling | Native `visibleRowCountMode="Auto"` |
| Server-side pagination | `MessageMonitoringService.list(criteria, page, pageSize, …)` |
| Column pinning | `fixedColumnCount` (columns flagged `pinnable` in `columns.ts`) |
| Column resize/reorder | Native `resizable`/`enableColumnReordering` |
| Column visibility | Columns popover ([`fragment/ColumnsPopover.fragment.xml`](fragment/ColumnsPopover.fragment.xml)) toggling `Column#setVisible` |
| Grouping | Native `enableGrouping`/`groupBy` (single column, toolbar Select) |
| Sorting / quick search | Native column sort + header `SearchField` |
| Density modes | `InvestigationGrid.setDensity()` (compact/cozy row height) |
| Saved layouts | [`GridLayoutService`](service/GridLayoutService.ts) (session-only; `getLayoutSnapshot()`/`applyLayoutSnapshot()`) |
| Context menu / row actions | `sap.m.Menu` built from [`config/investigationActions.ts`](config/investigationActions.ts), set via the native `contextMenu` aggregation |
| Bulk selection | Native `selectionMode="MultiToggle"` |
| Double-click navigation | Custom `onRowDoubleClick()` (native `sap.ui.table.Table` has no such event) — opens the Detail Drawer |
| Keyboard navigation | Native `sap.ui.table.Table` behaviour |

## Advanced Search (§ Advanced Search)

The left panel two-way binds every field directly into `view>/criteria` (a `MessageSearchCriteria`),
covering every field the backend's list endpoint accepts (status, severity, sender, receiver, message
type, custom status, application id, correlation id, queue, date range, duration, free text) plus two
client-side-only post-filters (has attachments/has payload — see the backend module's own doc comment
on why those are page-scoped, not full-result-set filters). **Smart filters**
([`config/smartFilters.ts`](config/smartFilters.ts)) are one-click presets the backend resolves into a
concrete query. **Saved searches** are session-only ([`SavedSearchService`](service/SavedSearchService.ts)),
"future persistence ready" per the phase spec, mirroring the shell's `FavoritesService` pattern.

## Investigation Panel / Context Panel (§ Investigation Panel, § Related Messages)

Selecting a row (or double-clicking, or a deep link) loads the Context Panel: status/health/summary,
environment, a runtime reference (matched by integration-flow name — a genuine correlation, since a
CPI IFlow's deployed-artifact name *is* its integration flow name), a best-effort queue reference (the
message's id searched across the tenant's enabled queues' parked messages — bounded, not fabricated),
a tenant-wide certificate watch (there is no domain field linking a message to a specific certificate,
so this is honestly a nearby-context glance, not a per-message reference — documented in the backend
DTO), recent related notifications, and related messages grouped by six dimensions (correlation id,
application id, sender, receiver, message type, custom status).

## Message Actions (§ Message Actions)

[`config/investigationActions.ts`](config/investigationActions.ts) declares every action; the
controller dispatches generically by `kind` (`navigate` | `drawerTab` | `copy` | `future`) — adding an
action is a metadata change only. "Open Payload"/"Export" (per-message) are declared but dispatch to a
"coming in a future phase" toast, matching Phase 9's explicit "no payload rendering — Phase 10" scope
boundary. **Retry** is gated behind `PI_RETRY_OPERATOR` (§ Permissions) and navigates to the Retry
Center's JMS Queue module — this phase builds the *framework*, not retry execution.

## Context Navigation (§ Context Navigation)

Every context-panel entity is navigable: Queue → `jmsQueue`, Certificate → `certificateManagement`,
Runtime → `liveMonitoring`, Alert → `alertNotification`, related Message → re-selects that message in
this same workspace. **Deep links**: the route pattern gained an optional query segment
(`messageMonitoring:?query:`, additive — the bare route is unchanged), decoded via the existing
`DeepLinkHelper` to auto-select and expand a specific message from an external link.

## Bookmarks (§ Bookmarks)

Session-only ([`BookmarkService`](service/BookmarkService.ts)), toggled from the Context Panel — "future
persistence ready," identical in spirit to `FavoritesService`/`SavedSearchService`/`GridLayoutService`.

## Export (§ Export)

CSV/JSON/XML/Excel via the shared [`ExportDialog`](../../library/fragments/ExportDialog.fragment.xml)
fragment (a Phase-1 scaffold this workspace is the first to wire up) and the Operations Engine's own
Export Engine (`engine.export.toCsv/toJson/toXml/toExcel`), reached through the backend's
`/export` endpoint. PDF is a documented future format (`ExportEngine.toPdf` rejects explicitly).

## Permissions (§ Permissions)

Workspace visibility requires `PI_MESSAGE_VIEWER` (added to this module's `WorkspaceCatalog.ts`
metadata); the Retry action requires `PI_RETRY_OPERATOR`. Both role collections were already declared
in Phase 7's `RoleCollections.ts` roadmap catalogue — gating a new action requires no new permission
mechanism, exactly as promised ("future permissions require no code changes").

## Tests

- Backend: [`srv/test/unit/operations/messageMonitoringModule.test.ts`](../../../../srv/test/unit/operations/messageMonitoringModule.test.ts) —
  list/severity/correlation/queue filters, smart filters, detail/related/context composition, every
  export format.
- Frontend: [`MessageMonitoringFormatterTest.qunit.js`](../../test/unit/MessageMonitoringFormatterTest.qunit.js) —
  health/severity/retry-status/formatter delegation.
