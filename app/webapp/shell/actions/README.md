# `shell/actions/` — Quick Actions (§16)

Reusable, declarative quick actions rendered in the header menu and on the landing page. Framework
only — the registry stores actions and filters them by permission; the shell renders and dispatches
them.

## `QuickActionDefinition`

`{ id, titleKey, icon, order, kind, workspaceId?, route?, command?, permission? }` where `kind` is:

- `openWorkspace` — activate `workspaceId`;
- `navigate` — navigate to `route`;
- `command` — raise a well-known `ShellCommands` value (e.g. `switchTenant`, `openSearch`,
  `openNotifications`) that the Shell controller maps to chrome behaviour.

## Defaults (§16)

Open Operations · Open Retry Center · Open Analytics · Switch Tenant · Open Administration
(the last gated by `Administration.Manage`).

## `QuickActionRegistry`

- `getActions()` — all actions, ordered.
- `getAuthorizedActions(engine)` — permission-filtered (§12).
- `register(action)` — future modules add actions (overwrite by id); `reset()` restores defaults.

No quick action carries executable logic in this layer — dispatch lives in the controllers, keeping
the registry pure and testable.
