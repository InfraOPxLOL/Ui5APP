# Operations Engine (`srv/src/operations/`)

The Phase-6 business logic layer — the **only** layer any future UI module is allowed to talk to.

```
UI  →  Operations Engine  →  Integration Suite SDK  →  Integration Suite
```

The UI never knows OData, REST, endpoint names, or authentication details — it only ever sees the
Operations DTO layer (`operations/dto/`). This phase builds **no UI**: no views, no controllers, no
Dashboard/Monitoring/Retry/Payload screens. It builds the business layer those future screens will
call into.

## Why this layer exists, distinct from the SDK

The SDK (`srv/src/sdk/`, Phases 4–5) is a **transport-and-connectivity** library: it knows how to
reach Integration Suite (real or mocked) and returns neutral domain types
(`MessageProcessingLog`, `CertificateInfo`, …). It has no opinion about how a UI wants that data
shaped, aggregated, or enriched.

The Operations Engine is the **business logic** layer built on top: it aggregates (statistics),
transforms (duration/health/severity calculations), enriches (human-readable labels) and normalizes
SDK responses into UI-ready DTOs (`MessageSummary`, `CertificateSummary`, …). Nothing in this layer
issues an HTTP call itself — every engine is constructed with an `IntegrationSuiteSdkClient` (or one
of its sub-clients) and does only shaping/aggregation on top.

## Layout

| Folder/file | Purpose | README |
|---|---|---|
| `OperationsEngine.ts` | The composition root — constructs and exposes every engine, all sharing one request-scoped cache. | — |
| `engines/` | The 13 engines (`MessageEngine`, `RuntimeEngine`, `PayloadEngine`, `HeaderEngine`, `AttachmentEngine`, `QueueEngine`, `CertificateEngine`, `StatisticsEngine`, `SearchEngine`, `FilterEngine`, `ExportEngine`, `RefreshEngine`, `NotificationEngine`). | [engines](engines/README.md) |
| `dto/` | The Operations DTO layer — the only shapes a UI ever sees. | [dto](dto/README.md) |
| `models/` | The universal query object + fluent builder (`OperationsQuery`/`OperationsQueryBuilder`). | [models](models/README.md) |
| `transform/` | Shared, pure enrichment helpers (duration/status/health/size/aggregation). | [transform](transform/README.md) |
| `cache/` | Request-scoped in-memory de-duplication (`OperationsCache`). | [cache](cache/README.md) |

## Construction

```ts
import { createOperationsEngine } from "../config/operationsEngineFactory.js";

const engine = createOperationsEngine({ enabled: true, defaultScenario: "success" });

const page = await engine.message.queryMessages(
  new OperationsQueryBuilder().status("FAILED").page(1).pageSize(50).build(),
);
```

`createOperationsEngine` (`srv/src/config/operationsEngineFactory.ts`) is the composition root that
reads this application's configuration (`config/connectivity.json`, `config/tenants.json`,
`config/queues.json`) and wires it into an `OperationsEngine` — mirroring `sdkClientFactory.ts` one
layer down. `OperationsEngine` itself never reads a configuration file (see its own doc comment);
this keeps it the same kind of portable, dependency-injected "enterprise framework" the SDK is,
capable of supporting the application for years without a redesign — a new engine method is always
additive, and a new engine is always another constructor-injected field, never a change to an
existing one.

Not called anywhere yet — this phase builds no route/module wiring, matching how Phase 4/5 left the
SDK client itself unwired until a consuming phase needed it.

## Design principles (carried through from the SDK)

- **Interfaces over concretions, composition over inheritance.** Every engine takes its SDK
  sub-client (or another engine, for `SearchEngine`/`StatisticsEngine`) as a constructor parameter.
- **No duplicated code.** Shared math (duration, health scoring, byte formatting, grouping/ranking)
  lives once in `transform/`; shared filtering logic lives once in `FilterEngine`'s generic core.
- **Open/Closed filtering.** `FilterEngine.register()` adds a new filterable field without touching
  any existing registration or the `apply()` method itself.
- **No SDK object ever escapes.** Every engine method's return type is an Operations DTO; nothing
  from `core/providers/types.ts` or `sdk/dto` is ever returned directly.
- **Caching is request-scoped only.** `OperationsCache` (built on Phase 1's `RequestMemo`) only
  de-duplicates concurrent identical calls within one `OperationsEngine`'s lifetime — no persistence,
  no long-term cache, no database, exactly as Phase 6 specifies.

## Testing

See `srv/test/unit/operations/` — covering the query builder, every transform helper, `FilterEngine`
(generic core + all four static factories), all 13 engines (each against a stubbed SDK provider
interface, wrapped in the real `sdk/client/*Client` facade — no network access), the composition
root (`OperationsEngine`, `getDashboardSummary`), and mock-vs-real provider compatibility at the
Operations layer (a `MessageSummary` built from `IntegrationSuiteSdkClient`'s mock mode has the same
key set as one built from its real mode). Run with `npm test --workspace=srv`.
