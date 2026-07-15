# `shell/permissions/` — Permission Framework (§6, §7)

A reusable permission engine that lets the UI **adapt** to what the signed-in user may do. It does
**not** implement a custom authorization system: the source of truth is always the XSUAA scopes
minted into the user's JWT (surfaced by `SessionService.getUser().scopes`), and the backend
re-validates every request. The engine only answers questions consistently in one place.

## Files

| File | Purpose |
|---|---|
| `RoleCollections.ts` | The declarative catalogue: `Scopes` (the frozen `xs-security.json` scope vocabulary), `RoleCollections` (well-known ids), and `ROLE_COLLECTIONS` (each collection expressed as the scopes it grants, with optional `inherits`). |
| `PermissionTypes.ts` | `PermissionRequirement` (the declarative gate attached to workspaces/modules/cards/actions/routes) and `PermissionContext` (scopes + future attributes). |
| `PermissionEngine.ts` | The engine: scope checks, role-collection resolution (with inheritance + caching), requirement evaluation, and future attribute lookup. |

## Role collections

Two families are catalogued:

- **Provisioned today** — `IntegrationPortal_Viewer` / `_Operator` / `_Administrator`, matching
  `xs-security.json` exactly.
- **Roadmap `PI_*` collections** (§7: `PI_OPERATIONS_VIEWER`, `PI_RETRY_ADMIN`, `PI_ADMIN`, …). The
  security descriptor is frozen, so each `PI_*` collection is expressed against the **real** scopes
  that exist today. Provisioning the matching XSUAA role collections is a deployment concern, not a
  code change. `RoleCollectionId` is `string`-open so new collections need no type change.

A collection is considered **held** when the user's granted scopes cover its fully-expanded
(inherited) scope set — so the engine can reason in role-collection terms even though the frontend
only receives scopes.

## Requirement semantics

A `PermissionRequirement` is satisfied when **all** hold:

- every scope in `allScopes` is granted, **and**
- at least one scope in `anyScope` is granted (ignored when omitted/empty), **and**
- at least one collection in `anyRoleCollection` is held (ignored when omitted/empty).

An omitted requirement is satisfied by any authenticated user.

## Caching & immutability

Expanded scope sets and per-collection "held" results are memoised for the engine's lifetime. The
engine is **immutable** — a permission change (login, tenant switch) builds a *new* engine via
`UserContext.initialize()`, so cached answers can never go stale.

## Example

```ts
const engine = new PermissionEngine({ scopes: ["Viewer", "Operator"] });
engine.hasScope("Viewer");                                  // true
engine.hasRoleCollection("IntegrationPortal_Administrator"); // false
engine.isSatisfied({ allScopes: ["Administration.Manage"] }); // false
engine.getAssignedRoleCollections();                         // ["IntegrationPortal_Viewer", ...]
```
