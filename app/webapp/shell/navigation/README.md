# `shell/navigation/` — Dynamic Navigation & Route Guards (§8, §12)

## `NavigationService` (§8)

Resolves the dynamic navigation by combining three inputs the `WorkspaceRegistry` deliberately does
not know about: config-driven module **enablement** + feature flags (`ConfigService`) and the
current user's **permissions** (`PermissionEngine`).

A module is:

- **enabled** — its `config.json` toggle is on and its feature flag (if any) is on;
- **authorized** — enabled *and* its permission requirement is satisfied → may activate its route
  and appear in search;
- **visible** — authorized *and* `showInSidebar` → appears in the sidebar.

A workspace is **visible** when its own permission is satisfied and it has at least one visible
module (empty/unauthorized workspaces never render). Key methods: `getVisibleWorkspaces`,
`getVisibleModules`, `getLandingWorkspaces`, `getLandingModules`, `findModuleByRoute`.

The service is pure (no view, no i18n) and takes a structural `ModuleEnablement` source, so it is
unit-tested with a fake enablement and a real `PermissionEngine`.

## `RouteGuard` (§12)

Module routes are declared statically in `manifest.json` (frozen), so the guard cannot literally
"not register" them. Instead it makes an unauthorized route **unreachable**: `install(router, onDenied)`
watches `routeMatched` and, when `canActivate(route)` is false, invokes `onDenied` (the Shell
redirects to home and shows a message). Together with `NavigationService` hiding the module from the
sidebar, landing cards and search, this satisfies §12's intent.

- Non-module routes (home, workspace shells) are always activatable.
- The guard takes a structural `PermissionSource`, so it tests without a router or session.
- **The backend remains the final authority** — the guard is a UI affordance, never the security
  boundary.

```ts
const guard = new RouteGuard(navigationService, userContext);
guard.canActivate("messageReplay"); // false without MessageReplay.Execute
guard.install(router, (route) => { /* redirect + toast */ });
```
