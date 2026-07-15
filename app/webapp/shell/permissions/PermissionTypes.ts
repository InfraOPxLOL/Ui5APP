import type { RoleCollectionId, Scope } from "./RoleCollections";

/**
 * A declarative permission requirement attached to a workspace, module, landing card, quick action
 * or route. The shell evaluates it against the current user's resolved permissions to decide
 * whether the guarded thing is visible/reachable (§6, §9, §12).
 *
 * Semantics — a requirement is **satisfied** when *all* of the following hold:
 * - every scope in {@link allScopes} is granted, and
 * - at least one scope in {@link anyScope} is granted (ignored when omitted/empty), and
 * - at least one collection in {@link anyRoleCollection} is held (ignored when omitted/empty).
 *
 * An empty/omitted requirement is satisfied by any authenticated user — the common case for
 * read-only surfaces gated only by the backend.
 */
export interface PermissionRequirement {
  /** The user must hold at least one of these scopes (OR). Omitted/empty ⇒ not constraining. */
  readonly anyScope?: readonly Scope[];
  /** The user must hold every one of these scopes (AND). Omitted/empty ⇒ not constraining. */
  readonly allScopes?: readonly Scope[];
  /** The user must hold at least one of these role collections (OR). Omitted/empty ⇒ not constraining. */
  readonly anyRoleCollection?: readonly RoleCollectionId[];
}

/**
 * A snapshot of everything the {@link module:shell/permissions/PermissionEngine} needs to resolve
 * permissions for the current user. Sourced from `SessionService` (scopes) plus, optionally, XSUAA
 * user attributes for forward-looking attribute-based checks (§6).
 */
export interface PermissionContext {
  /** Effective XSUAA scopes (short names) granted to the user. */
  readonly scopes: readonly Scope[];
  /**
   * XSUAA user attributes (name → values). Empty today — reserved so attribute-based rules can be
   * added later without changing the engine's shape (§6, "Future Attributes").
   */
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
}
