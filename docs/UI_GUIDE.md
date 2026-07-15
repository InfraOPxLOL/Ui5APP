# UI Guide — What Every Workspace and Tab Does

A complete, ground-truth reference for every workspace, module and tab in the Integration Portal
sidebar, written from the actual current code (views, controllers, backend services) rather than
from what any phase originally planned. Where a screen still returns placeholder data, that is
called out explicitly rather than glossed over — the codebase's own convention is to document a gap
honestly instead of fabricating behavior that doesn't exist yet.

## Legend

| Symbol | Meaning |
|---|---|
| 🟢 Live | Backed by real SAP Integration Suite data through the Operations Engine. |
| 🟡 Partial | Some fields/actions are real; others are heuristics, tenant-wide approximations, or documented gaps. |
| ⚪ Placeholder | The backend still returns an empty page (`emptyPage()`) — a Phase 1/2/3 scaffold that was never wired to a real data source. The screen renders, the columns are real, but it will always be empty. |

Workspaces are listed in sidebar order (top to bottom).

---

## 1. Operations workspace

*"Monitor message processing, live traffic, alerts and value mappings across your integration
landscape."*

### Dashboard 🟢 *(module: `dashboard`, default landing page)*

The operator's command center — answers "is the tenant healthy, what needs attention, what changed
recently, what should I do next?" in one screen, backed entirely by `GET /api/v1/operations/overview`.

| Section | What it shows |
|---|---|
| **Tenant & Runtime Health** | Six health widgets — Tenant (composite rollup), Runtime, Deployment, Queue, Certificate, Alert — each with a status, value/total, description and a recommended action. Click a widget to drill into its module. |
| **Quick Actions** | Metadata-driven shortcut tiles to common operator tasks. |
| **Top Active Interfaces** | Cards ranking integration flows by message volume, with failure/warning counts and average runtime. |
| **Operations Timeline** | A merged, newest-first feed of recent failures, recoveries (a correlation id that failed then later completed), deployments, alerts, runtime errors and queue-pressure events. Filterable by kind via a segmented button. |
| **Most Recent Failures** | The latest failed messages, severity-highlighted. |
| **System Status** | Active alerts. |

Also has: a global operations search bar (searches messages/queues/certificates/runtime artifacts
at once, results grouped by domain), a statistics time-window selector, manual/auto-refresh with
pause, and an environment ribbon (color-coded DEV/TEST/QA/PROD banner).

### Message Monitoring 🟢 *(module: `messageMonitoring`, workspace label: "Message Investigation")*

The main investigation tool for message-level troubleshooting. Layout is a four-pane resizable
splitter, not a tab bar:

| Pane | What it does |
|---|---|
| **Left — Advanced Search** | Every filterable field the backend supports (status, severity, sender, receiver, message type, custom status, application id, correlation id, queue, date range, duration, free text) plus one-click **smart filter** presets and session-saved searches. |
| **Center — Message Table** | A virtualized, high-density grid (column pin/reorder/resize/hide, grouping, multi-select, sortable, saved layouts). Double-click or select a row to open the detail/context views. |
| **Right — Context Panel** | For the selected message: status/health summary, environment, a matched runtime artifact (by integration-flow name), a best-effort queue reference (searched across enabled queues' parked messages), a tenant-wide certificate-expiry watch, recent related notifications, and related messages grouped by correlation id / application id / sender / receiver / message type / custom status. |
| **Bottom — Detail Drawer** | Expandable full message detail, including a timeline of the message's lifecycle events. |

Row actions (via context menu): Retry (gated behind `PI_RETRY_OPERATOR`, navigates to the JMS
Queues screen), Open Payload (→ Payload Studio), Open in new context, copy id, bookmark. Export
supports CSV/JSON/XML/Excel (PDF is explicitly not implemented).

### Payload Studio 🟢 *(module: `payloadStudio` — not in sidebar; opened only from Message Monitoring's "Open Payload" action)*

A read-only payload investigation environment, one splitter with three panes plus an expandable
bottom panel:

| Pane / tab | What it does |
|---|---|
| **Payload Navigation** (left) | Switches the center editor between Request Payload, Response Payload, and a side-by-side Comparison mode; also focuses the bottom panel on Attachments/Headers/Properties. "History" is a documented future item — no payload-revision history exists in the data model yet. |
| **Payload Editor** (center) | A real code editor (`sap.ui.codeeditor.CodeEditor`, Ace-based) with syntax highlighting, line numbers, folding, word wrap, Pretty/Raw/Tree view modes. Always read-only. Find/replace/go-to-line use Ace's own built-in keybindings (Ctrl+F, Ctrl+G). |
| **Metadata Panel** (right) | Content type, size, encoding/character set (derived, assumed UTF-8 when undeclared), compression (always reported "none" — not tracked in the data model), and computed statistics (lines/characters/nodes/elements/attributes, for XML/JSON). |
| **Bottom panel** | Properties, Attachments (name/type/size list — no preview yet), Headers, Validation (read-only XML well-formedness / JSON parseability check). |

Comparison is between one message's own request and its own response — comparing two *different*
messages is a documented future capability, not implemented. Download Payload requires
`PI_PAYLOAD_ADMIN` (higher bar than viewing).

### Alerts ⚪ *(module: `alertNotification`)*

Columns: Alert ID, Severity, Title, Source, Raised At. Backend still returns an empty page
unconditionally — a Phase 1 scaffold never connected to the Operations Engine. Notably, **real alert
data already exists and is used elsewhere** in the app (Dashboard's "System Status" section and
Alert health widget, Runtime Center's active-alert matching) via the Operations Engine's notification
provider — this standalone list page was simply never wired to that same source, so alerts you can
see on the Dashboard will not appear here. Kept as-is for now (no changes planned).

> **Removed from navigation:** Live Monitoring and Value Mapping were both permanently-empty
> placeholder screens (Live Monitoring's functionality is superseded by Message Monitoring's real
> data; Value Mapping had no real backing and no planned use). Unregistered from the sidebar/router
> rather than deleted — the module code and backend routes still exist on disk, just unrouted.

---

## 2. Retry Center workspace

*"Recover failed messages and manage JMS queues, dead-letter handling and replays."* The older,
Phase 1 counterpart to the newer Recovery Center workspace (below) — both exist side by side; this
one is simpler and list-only.

### Message Replay 🟡 *(module: `messageReplay`)*

Columns: Message ID, Integration Flow, Status, Failed At, Retry Count. Lists real `FAILED` messages
from the Operations Engine (`engine.message.queryMessages`). **Retry Count is always shown as 0** —
that field doesn't exist on the general message-processing-log data the backend reads. There is
currently **no Replay button in the UI** — only Refresh and Export — even though the backend exposes
`POST /:messageId/replay`; that endpoint itself is also a placeholder that always reports success
without actually replaying anything (the Operations Engine has no "replay an arbitrary message" API,
only JMS-queue-scoped retry via the Recovery Center).

> **Planned:** this module's role is being absorbed into a new "Failed Messages" tab inside Recovery
> Center, with real retry counts and DLQ context — see Roadmap at the bottom of this document.

### JMS Queues 🟢 *(module: `jmsQueue`)*

Columns: Queue Name, State, Message Count, Consumer Count, Capacity Used %. Lists every queue the
tenant reports, with real state/message-count/utilization from the Cloud Integration JMS OData API.
As with Message Replay, there is currently **no Purge button in the UI** — only Refresh and Export —
even though the backend supports `POST /:queueName/purge` and would genuinely delete every message
on the queue if called.

---

## 3. Recovery Center workspace 🟢 *(module: `recoveryCenter`)*

*"Discover, validate and recover failed integrations parked on dead-letter and retry queues."* A
full operational workspace — five section tabs on the left, a collapsible Context Panel on the
right.

| Tab | What it does |
|---|---|
| **Dashboard** | One combined view: recovery candidates, queue health, DLQ overview, recovery statistics and recent recoveries. |
| **Queue Explorer** | Every queue's depth, oldest/newest parked message age and consumer status, with search/sort/filter and session-saved layouts. |
| **Candidates** | The dead-letter/retry queues that currently hold parked messages, ready to recover. Supports multi-select, "recover selected," "recover all" (needs `PI_RECOVERY_ADMIN`), smart filters (all/ready/blocked) and grouping by source queue. |
| **Queue Health** | A 0–100 heuristic health score per queue (capacity headroom + consumer presence + message age — no historical baseline exists, so this is a documented approximation), growth trend, consumer status and recovery readiness. |
| **History** | Every recovery run's start/end time, duration, status, operator and result. Session-only (resets when the backend restarts) — not yet persisted to a database. |

Selecting a queue opens the **Context Panel**: queue metadata, a related-message summary, recent
activity, and quick actions (recover this queue, copy queue name, jump to Message Monitoring or Live
Monitoring). Every recovery goes through **Recovery Preview** first — source, destination, message
count, estimated duration, six validation checks (queue exists, consumer active, runtime available,
queue mapping configured, permission, target reachable) — and Confirm is disabled if any check
fails. Source→destination queue mapping is read only from `config/queues.json`'s
`deadLetterQueue`/`retryQueue` fields; a queue with no matching config entry is honestly reported as
unrecoverable rather than guessed.

---

## 4. Runtime Center workspace 🟢 *(module: `runtimeCenter`)*

*"Browse deployed integration flows, their runtime health, deployment history and related messages,
queues and certificates."* Integration Catalog on the left, a collapsible Integration Details panel
on the right with five tabs.

**Integration Catalog** — every deployed integration flow with status, version, runtime health and
deployment count; searchable and filterable by health status. Selecting a row opens Integration
Details:

| Tab | What it does |
|---|---|
| **Runtime Status** | Current status/version/health, a Runtime Health score, and a Redeploy action (needs `PI_RUNTIME_ADMIN`). |
| **Deploy History** | The flow's deployment timeline — session-only, seeded from the artifact's real current version, growing only from actual redeploys performed through this screen (never fabricated history). |
| **Messages** | Recent messages for this specific flow, server-side filtered by integration flow name. |
| **Queues** | Every configured queue on the tenant, for operator context. **Not** filtered to queues this flow actually uses — no queue-to-flow mapping exists in the data model, so this is a tenant-wide list, documented as such. |
| **Certificates** | Certificates expiring soon, tenant-wide — same caveat as Queues. |

Runtime Health score combines runtime status, message success rate and a penalty per matched active
alert (matched by text search against the flow's name — no structured alert-to-flow link exists).
Related Navigation buttons jump to Message Monitoring, Payload Studio (deep-linked to the flow's most
recent message), Recovery Center, and Certificates.

---

## 5. Certificate & Security Center workspace 🟡 *(module: `certificateSecurityCenter`)*

*"Monitor certificate health, expiry and security posture across your integration landscape."*
Section tabs on the left, a collapsible Certificate Details panel on the right.

| Tab | What it does |
|---|---|
| **Dashboard** | Certificate health summary, expiring/expired lists, an aggregate health score, and Security Materials availability. |
| **Certificate Explorer** | Every certificate, searchable, with Smart Filters (Expiring in 7/30 Days, Expired, Self-Signed, Weak Algorithm). Selecting a row opens Certificate Details. |
| **Security Materials** | One row per category — OAuth Credentials, Keystore, Trust Store, SSH Keys, PGP Keys. **Only Keystore is backed by real data**; the other four categories always report themselves as unavailable, each naming why (no matching API in the SDK today) rather than showing fabricated rows. |

Certificate Details has two tabs: **Details** (issuer, owner, validity, serial number, key type, plus
two heuristics — Self-Signed, computed as `owner === issuer`, and Weak Algorithm, a known-weak
substring match — both clearly labeled as approximations, not certainties; a Risk Score derived from
these plus expiry proximity; and an Impact Analysis section that honestly states affected
flows/destinations are unavailable, since no such mapping exists) and **Timeline** (session-only
history of Imported/Expiring/Expired/Flagged-for-Renewal events). "Flag for Renewal" (needs
`PI_CERTIFICATE_ADMIN`) is the one real write action this domain supports — the underlying API is
otherwise read-only.

---

## 6. Analytics workspace ⚪

*"Explore throughput, latency and API usage trends across tenants."*

### Analytics *(module: `analytics`)*
Columns: Metric, Value, Period. Placeholder — always empty.

### API Monitoring *(module: `apiMonitoring`)*
Columns: API Name, Status, Calls Today, Avg Latency. Placeholder — always empty.

---

## 7. Governance workspace ⚪

*"Review audit trails, roles and integration advisories for compliance."*

### Audit Trail *(module: `auditView`)*
Columns: Timestamp, Actor, Action, Target, Correlation ID. Placeholder — always empty. Note: the
backend *does* record real audit events today (e.g. every JMS purge or message replay call writes a
structured audit log line via `auditLog()`), but those go to the server's log stream, not to any
store this page reads from — so real audit activity is currently invisible here.

### Roles *(module: `roleView`)*
Columns: Role Name, Description, Scope Count. Placeholder — always empty. (The permission *system*
itself is real and enforced everywhere else in the app — `RoleCollections.ts` and the XSUAA scopes
in `xs-security.json` are what actually gate every admin action described above — this page just
doesn't list them yet.)

### Integration Advisor *(module: `integrationAdvisor`)*
Columns: Name, Artifact Type, Status, Updated At. Placeholder — always empty.

---

## 8. Administration workspace 🟡 *(module: `administration`, requires `Administration.Manage` scope)*

*"Manage destinations, module enablement and platform settings."*

Columns: Destination Name, Tenant Label, Status, Base URL. Lists every tenant destination configured
in `config/tenants.json` — real configuration data, not a placeholder. **Status always shows
"UNKNOWN"** — a live connectivity/reachability check was never implemented, so the column exists but
never resolves to a real up/down state.

---

## Quick reference: what's real right now

| Fully live | Partially live (real + documented heuristics/gaps) | Placeholder (always empty) |
|---|---|---|
| Dashboard | Message Replay (no size data) | Alerts |
| Message Monitoring | JMS Queues (Purge not wired to UI) | Analytics, API Monitoring |
| Payload Studio | Certificate & Security Center (Security Materials mostly unavailable) | Audit Trail, Roles, Integration Advisor |
| Recovery Center | Administration (status always UNKNOWN) | |
| Runtime Center | | |

## Roadmap — planned next (see `docs/` plan history for details)

Per direct product feedback, the following restructuring is planned in confirmable phases:

- **Removed from navigation (done):** Live Monitoring, Value Mapping, and the legacy Certificates
  workspace (`certificateManagement` + `securityMaterials`, both folded into Certificate & Security
  Center, which already covers the same ground with real data).
- **Planned:** Message Monitoring gets a filter-first UX plus deeper MPL fields (package, log level,
  deployed-by/version, `SAP_*` custom headers, client-side regex search). Recovery Center gains a
  "Failed Messages" tab absorbing Message Replay's role, with real retry counts and DLQ context
  (replacing today's hardcoded `0`). JMS Queues becomes a real per-queue health/capacity monitor.
  Runtime Center gains package/iflow pre-filtering. Analytics becomes a real dashboard (DB usage, JMS
  usage, failure trends) — all backed by SAP Integration Suite APIs already confirmed available.
