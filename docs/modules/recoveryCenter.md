# Recovery Center (Phase 11)

A complete operational workspace for recovering failed integrations parked on JMS dead-letter and
retry queues. Reachable from the sidebar and landing page as its own workspace ("Recovery Center"),
distinct from the earlier Phase-1 "Retry Center" workspace (`messageReplay`/`jmsQueue`), which is
untouched by this phase.

## Architecture — consumes only the Operations Engine

```
Recovery Center (this module)
   ↓ HTTP: GET/POST /api/v1/recovery-center/*
Recovery Center module (srv/src/modules/recovery-center)   ← composes the DTOs
   ↓
Operations Engine → RecoveryEngine (srv/src/operations/engines/RecoveryEngine.ts)
   ↓ (QueueEngine, JmsClient, RuntimeEngine)
Integration Suite SDK → SAP Integration Suite
```

The UI never talks to the SDK, never knows a JMS queue entity-set name — only the Recovery Center
DTOs ([`service/RecoveryCenterTypes.ts`](service/RecoveryCenterTypes.ts)), fetched through
[`RecoveryCenterService`](service/RecoveryCenterService.ts).

## Queue mapping — no hardcoded queue names

"Recovery" means moving parked messages from a dead-letter/retry queue (the **source**) back toward
the queue they originally belonged to (the **destination**). This mapping is read **only** from
`config/queues.json`'s existing `deadLetterQueue`/`retryQueue` fields — no new configuration concept
and no queue name is ever hardcoded, on either side of the stack. A dead-letter/retry queue with no
matching `config/queues.json` entry has no resolvable destination; validation reports this honestly
(`queueMappingExists: false`) rather than guessing one.

## Sections

- **Recovery Dashboard** — recovery candidates, queue health, DLQ overview, recovery statistics and
  recent recoveries, composed in one round trip (`GET /recovery-center/dashboard`).
- **Queue Explorer** — queue list, depth, oldest/newest message, consumer status, search, sorting,
  filtering and saved layouts ([`service/RecoveryLayoutService.ts`](service/RecoveryLayoutService.ts),
  session-only, future persistence ready — mirrors `messageMonitoring`'s `GridLayoutService`). Shows
  the same per-queue data as Queue Health, with an operational (depth/age) emphasis.
- **Recovery Candidates** — recover selected, recover all, bulk selection (multi-select table), smart
  filters (all/ready/blocked) and grouping by source queue.
- **Recovery Preview** — before every recovery: source queue, destination queue, message count,
  estimated duration, validation results, warnings, impact analysis and an explicit confirmation step.
  Confirm is disabled whenever any validation check fails.
- **Recovery Validation** — six checks (queue exists, consumer active, runtime available, queue
  mapping exists, user permission, target queue reachable), each with a human-readable message.
  `runtimeAvailable` is necessarily a general reachability check — no queue-to-integration-flow
  mapping exists in this domain model, an honestly documented gap rather than a fabricated one.
- **Recovery Operations** — recover selected, recover all, dry-run simulation, cancel a
  recorded-but-unfinalized recovery, retry a previously failed/cancelled one. "Move messages" is the
  recovery operation itself (source → destination via `JmsClient.retryMessage`, the same seam
  `RealJmsProvider`'s doc comment names as the future "JMS Retry Center").
- **Recovery History** — start/end time, duration, status, operator, result. Session-only, backed by
  a process-lifetime singleton (`RecoveryStateStore`, server-side) — future persistence ready.
- **Queue Health** — health score (a documented heuristic: capacity headroom, consumer presence,
  message age — no historical baseline exists to calibrate a more precise model against), growth
  trend (derived from in-memory samples taken across calls), consumer status, oldest message,
  recovery readiness.
- **Context Panel** — queue metadata, related-message summary, runtime/queue-strategy info, recent
  activity and quick actions (recover this queue, copy queue name, open Message Investigation, open
  Live Monitoring).

## Permissions

- `PI_RECOVERY_VIEWER` — gates the module itself (`WorkspaceCatalog.ts`).
- `PI_RETRY_OPERATOR` — an already-existing roadmap role collection (`RoleCollections.ts`), reused
  here for "recover selected"/cancel/retry (mirrors `message-replay`'s existing use of the same real
  `MessageReplay.Execute` XSUAA scope).
- `PI_RECOVERY_ADMIN` — required for "recover all" (a strictly larger blast radius than a bounded
  selection), enforced both client-side (button disabled) and server-side (`JmsQueue.Purge` scope
  check in `recovery-center/controller.ts`).

Every destructive operation requires validation (Recovery Validation) and an explicit confirmation
step (Recovery Preview's Confirm button) — never a browser `confirm()`/`alert()`.

## Files

- `service/RecoveryCenterTypes.ts` — client mirror of the backend Recovery DTOs.
- `service/RecoveryCenterService.ts` — the only class allowed to call `/api/v1/recovery-center`.
- `service/RecoveryLayoutService.ts` — session-only saved Queue Explorer layouts.
- `model/RecoveryCenterModel.ts` — the module's single view model.
- `formatter/RecoveryCenterFormatter.ts` — readiness/consumer/growth-trend/status → UI5 value
  states/icons (a vocabulary specific to this module, so it doesn't reuse `core/formatters/HealthFormatter`).
- `controller/RecoveryCenter.controller.ts` — orchestration only: loads data, dispatches actions,
  drives the preview/confirmation flow. No business logic.
- `view/RecoveryCenter.view.xml` — a resizable `sap.ui.layout.Splitter` (section tabs | Context Panel),
  mirroring the chrome already established by Message Investigation and Payload Studio.
- `fragment/*.fragment.xml` — one fragment per section tab, plus the Context Panel and the Recovery
  Preview / confirmation dialog.
