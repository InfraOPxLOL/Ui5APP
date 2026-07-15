# Runtime Center (Phase 12)

A complete operational workspace for browsing deployed integration flows — the Integration Catalog,
per-flow Integration Details, Runtime Health and the Deployment Timeline.

## Architecture — consumes only the Operations Engine

```
Runtime Center (this module)
   ↓ HTTP: GET/POST /api/v1/runtime-center/*
Runtime Center module (srv/src/modules/runtime-center)   ← composes the DTOs
   ↓
Operations Engine → RuntimeCenterEngine (srv/src/operations/engines/RuntimeCenterEngine.ts)
   ↓ (RuntimeEngine, MessageEngine, QueueEngine, CertificateEngine, NotificationEngine)
Integration Suite SDK → SAP Integration Suite
```

The UI never talks to the SDK, never knows a runtime artifact entity-set name — only the Runtime
Center DTOs ([`service/RuntimeCenterTypes.ts`](service/RuntimeCenterTypes.ts)), fetched through
[`RuntimeCenterService`](service/RuntimeCenterService.ts).

## Sections

- **Integration Catalog** — every deployed integration flow (filtered from all runtime artifacts by
  type), with status, version, runtime health, deployment count, search and a health-status filter.
- **Integration Details** — opened from a catalog row, in a collapsible side panel with five tabs:
  - **Runtime Status** — the artifact's current status/version/health plus Runtime Health and a
    Redeploy action.
  - **Deploy History** — the Deployment Timeline.
  - **Messages** — recent messages for this specific flow (server-side filtered by integration flow
    name).
  - **Queues** — every configured queue on the tenant, for operator context. **Not** filtered to
    queues this flow uses — no queue-to-integration-flow mapping exists in this domain model
    (documented on `IntegrationDetails.relatedQueues` itself, matching how `RecoveryEngine` documents
    its own `runtimeAvailable` validation check).
  - **Certificates** — certificates expiring soon on the tenant, same tenant-wide caveat as Queues.
- **Runtime Health** — health score (a documented heuristic: runtime status baseline, averaged with
  success rate, penalized per matched active alert), success rate, average runtime, failure trend
  (derived from in-memory samples taken across calls) and active alerts (matched by real text search
  against the flow's name — no structured alert-to-flow reference exists in this domain model).
- **Deployment Timeline** — session-only, backed by a process-lifetime singleton
  (`RuntimeCenterStateStore`, server-side) — auto-seeded from the artifact's actual current
  version/deploy info, growing only from real redeploy actions taken through this workspace, never
  fabricated history.
- **Related Navigation** — Open Messages (Message Investigation), Open Payload (Payload Studio, deep
  linking to the flow's most recent message when one exists), Open Recovery (Recovery Center), Open
  Certificates (Certificate Management).

## Permissions

- `PI_RUNTIME_VIEWER` — gates the module itself (`WorkspaceCatalog.ts`).
- `PI_RUNTIME_ADMIN` — required for redeploy, enforced both client-side and server-side (`Operator`
  scope check in `runtime-center/routes.ts` — no dedicated "Runtime.Restart" scope exists in the
  frozen `xs-security.json`, so this roadmap collection is expressed against the real `Operator`
  scope, mirroring `CertificateAdmin`'s exact precedent).

## Files

- `service/RuntimeCenterTypes.ts` — client mirror of the backend Runtime Center DTOs.
- `service/RuntimeCenterService.ts` — the only class allowed to call `/api/v1/runtime-center`.
- `model/RuntimeCenterModel.ts` — the module's single view model.
- `formatter/RuntimeCenterFormatter.ts` — health/failure-trend/deployment-event/severity → UI5 value
  states/icons; `health`/`severity` delegate to `core/formatters/HealthFormatter` since those reuse
  the shared Operations Engine vocabulary verbatim, while failure trend and deployment events are
  vocabularies specific to this module.
- `controller/RuntimeCenter.controller.ts` — orchestration only: loads the catalog, loads a selected
  artifact's Details/Health/Timeline in parallel, dispatches Redeploy and Related Navigation. No
  business logic.
- `view/RuntimeCenter.view.xml` — a resizable `sap.ui.layout.Splitter` (Integration Catalog | a
  collapsible Integration Details panel), mirroring the chrome established by Recovery Center.
- `fragment/*.fragment.xml` — one fragment per Integration Details tab (Runtime Status, Deploy
  History, Messages, Queues, Certificates).
