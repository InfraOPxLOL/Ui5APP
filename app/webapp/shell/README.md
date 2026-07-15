# `shell/` — Application Experience Platform (Phase 7)

The **shell** is the permanent, reusable container of the Integration Portal — our own Fiori
Launchpad tuned for Integration Operations. It renders the header, workspace navigation, dynamic
sidebar, breadcrumbs, notifications, tenant selector, global search, quick actions, user profile and
footer, and hosts every module inside a single module container. Nothing about it is hardcoded:
what a user sees is derived entirely from **registries, metadata, permissions and configuration**.

## Layering

```
Application Shell   ← this folder (chrome + landing + framework services)
      ↓
Workspace           ← WorkspaceRegistry (metadata grouping modules)
      ↓
Module              ← modules/* (frozen, lazy-loaded components)
      ↓
Operations Engine   ← srv/ business layer (Phase 6)
      ↓
Integration Suite SDK → SAP Integration Suite
```

The shell **never** knows Integration Suite APIs and holds **no business logic**. Controllers read
an event, call one framework service, and rebind. All cross-cutting decisions (what is visible,
what a user may open) funnel through the framework services below.

## Folder map

| Folder | Framework | Docs |
|---|---|---|
| `permissions/` | Permission engine, role collections, scopes (§6, §7) | [permissions/README.md](permissions/README.md) |
| `registry/` | Workspace registry + module metadata (§4, §5) | [registry/README.md](registry/README.md) |
| `context/` | User context + tenant context (§10, §11) | [context/README.md](context/README.md) |
| `navigation/` | Dynamic navigation + route guards (§8, §12) | [navigation/README.md](navigation/README.md) |
| `notifications/` | Notification center (§13) | [notifications/README.md](notifications/README.md) |
| `search/` | Global search framework (§14) | [search/README.md](search/README.md) |
| `favorites/` | Favorites & recents (§15) | [favorites/README.md](favorites/README.md) |
| `actions/` | Quick actions (§16) | [actions/README.md](actions/README.md) |
| `branding/` | Configuration-driven branding (§17) | [branding/README.md](branding/README.md) |
| `landing/` | The landing (home) experience (§2, §9) | [landing/README.md](landing/README.md) |
| `model/` | `ModuleRegistry` (frozen), `ShellViewBuilder`, `ShellViewTypes` | — |
| `controller/`, `view/`, `fragments/` | Shell chrome (`Shell.view.xml`, popovers) | see below |

## Shell components

- **`view/Shell.view.xml`** — the `sap.tnt.ToolPage`: header (menu, brand/home, workspace selector,
  global search, quick-actions menu, tenant selector, environment banner, notification bell, user
  profile), the dynamic `SideNavigation`, and a main area wrapping breadcrumbs + the
  `moduleContainer` `NavContainer` + footer.
- **`controller/Shell.controller.ts`** — orchestrates the chrome. Builds a `shell` JSON model via
  the pure `ShellViewBuilder`, installs the `RouteGuard`, tracks `routeMatched` to keep the active
  workspace/sidebar/breadcrumbs current, records recents, and reacts to `context:changed`,
  `context:favoritesChanged`, `session:tenantChanged` and `context:shellCommand`.
- **`fragments/`** — `NotificationPanel`, `UserMenu`, `TenantMenu`, `SearchResults` popovers.
- **`model/ShellViewBuilder.ts`** — a **pure, UI5-free** mapper from the framework services to the
  resolved view models in `ShellViewTypes.ts`, shared by the Shell and Home controllers so the
  landing/navigation mapping is never duplicated and is fully unit-testable.

## How metadata flows into what you see

1. `ConfigService` says which modules are **enabled** (+ feature flags).
2. `WorkspaceRegistry` says which **workspace** each module belongs to and its ordering/visibility.
3. `PermissionEngine` (from `UserContext`) says what the user is **authorized** for.
4. `NavigationService` combines the three into the visible workspaces, sidebar items, landing cards
   and route-activation decisions.
5. `ShellViewBuilder` translates those into view models; the Shell/Home views bind to them.

## Extending the shell (no shell edits required)

- **New module**: add its core `ModuleRegistry` entry (frozen convention) **and** a
  `WorkspaceRegistry.registerModule({...})` entry (or extend the default catalogue). It appears in
  its workspace's sidebar/landing automatically once enabled and authorized.
- **New workspace**: `WorkspaceRegistry.registerWorkspace({...})`.
- **New quick action / search provider**: `QuickActionRegistry.register(...)` /
  `GlobalSearch.register(...)`.

Every registration is metadata; no navigation, landing or routing code changes.

## Testing

Unit tests live in `app/webapp/test/unit/` (UI5 QUnit runner): `PermissionEngineTest`,
`WorkspaceRegistryTest`, `NavigationServiceTest`, `RouteGuardTest`, `ShellViewBuilderTest`,
`FavoritesServiceTest`, `QuickActionRegistryTest`, `TenantContextTest`, `UserContextTest`. The pure
services accept injected dependencies (a fake enablement source, a permission source, session/theme
sources) so they test without a live backend.
