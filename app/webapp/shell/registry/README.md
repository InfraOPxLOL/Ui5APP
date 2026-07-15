# `shell/registry/` — Workspace & Module Registries (§4, §5)

The metadata-driven registry of **workspaces** and **module→workspace assignments**. It sits beside
the frozen core `ModuleRegistry` (which still owns each module's id/title/icon/route/group) and
layers the workspace framework on top — without touching the core registry.

## Files

| File | Purpose |
|---|---|
| `WorkspaceTypes.ts` | `WorkspaceDefinition` (§4), `ShellModuleMetadata` (§5), `RegisteredModule` (the merge of core definition + shell metadata), and the `Workspaces` id constants. |
| `WorkspaceCatalog.ts` | The declarative seed: `DEFAULT_WORKSPACES` and `DEFAULT_MODULE_METADATA` (every core module assigned to exactly one workspace). |
| `WorkspaceRegistry.ts` | The singleton registry: pure metadata store with getters + runtime `registerWorkspace`/`registerModule`. |

## Workspace metadata (§4)

Id · Title · Description · Icon · Theme accent · Order · Permission · Landing visibility ·
Sidebar visibility · Modules · Default route.

## Module metadata (§5)

Module id · Workspace · Permission · Feature flag · Navigation order · Landing card · Sidebar
visibility · Badge provider id · Search provider id. (Title/route/icon come from the frozen core
`ModuleDefinition`, merged into `RegisteredModule`.)

## Default workspaces

| Workspace | Modules |
|---|---|
| Operations | dashboard, messageMonitoring, liveMonitoring, alertNotification, valueMapping |
| Retry Center | messageReplay, jmsQueue |
| Analytics | analytics, apiMonitoring |
| Governance | auditView, roleView, integrationAdvisor |
| Certificates | certificateManagement, securityMaterials |
| Administration | administration |

## Purity & testing

The registry is **pure** — it knows nothing about the user, permissions or config enablement;
`NavigationService` resolves visibility against those. This keeps it independently testable, and it
asserts a 1:1 correspondence with the core `ModuleRegistry` by returning only modules that have both
a core definition and shell metadata.

## Extension

```ts
WorkspaceRegistry.getInstance().registerWorkspace({ id: "myWorkspace", /* … */ });
WorkspaceRegistry.getInstance().registerModule({ moduleId: "myModule", workspace: "myWorkspace", /* … */ });
```

Registrations overwrite by id; `reset()` restores the seeded defaults (used by tests).
