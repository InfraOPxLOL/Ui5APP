# `shell/context/` — User & Tenant Context (§10, §11)

The shell-level "who is here and where" services. The whole application reads identity, permissions,
tenant, workspace, theme, language and favorites through these, rather than reaching into the
individual services.

## `UserContext` (§10)

The single aggregation point. Exposes: display name, email, user id, current tenant, current
workspace, assigned role collections, resolved permissions, theme, language, favorites, recent
workspaces and session info — plus `toSnapshot()` for a flat, bindable projection.

- Owns the live `PermissionEngine`, rebuilt by `initialize(reason)` (bootstrap, tenant switch) so
  cached permission answers never go stale. `initialize` broadcasts `context:changed`.
- Owns the **current workspace** pointer; `setCurrentWorkspace()` records the visit as recent and
  broadcasts `context:workspaceChanged`.
- Depends on small structural sources (`SessionSource`, `TenantSource`, `FavoritesSource`,
  `ThemeSource`); `UserContext.createForTest({...})` injects fakes so it tests without a live
  backend.

## `TenantContext` (§11)

The authority for the active tenant and for switching it. Wraps the frozen global `TenantModel`
(the single source of truth, bound throughout the UI) rather than duplicating its state.

- `switchTenant(id)` delegates to `TenantModel.selectTenant`, which validates the id and, on a real
  change, broadcasts `session:tenantChanged`.
- Every dependent subsystem — permissions, navigation, and future monitoring modules — reacts to
  that **one broadcast** and reloads. The Shell controller additionally calls
  `UserContext.initialize("tenantChanged")` so permissions are re-resolved. Switching is never wired
  point-to-point.

## Events

| Event | Raised by | Consumed by |
|---|---|---|
| `context:changed` | `UserContext.initialize` | Shell + Home rebuild navigation/cards/search |
| `context:workspaceChanged` | `UserContext.setCurrentWorkspace` | (available for future modules) |
| `session:tenantChanged` | `TenantModel.selectTenant` | Shell, Home, future monitoring modules |
