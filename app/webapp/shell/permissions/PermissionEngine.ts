import {
  ROLE_COLLECTIONS,
  type RoleCollectionDefinition,
  type RoleCollectionId,
  type Scope,
} from "./RoleCollections";
import type { PermissionContext, PermissionRequirement } from "./PermissionTypes";

/**
 * The reusable, XSUAA-aligned permission engine (§6).
 *
 * It does **not** implement a custom authorization system: the granted scopes it is constructed
 * with come straight from the XSUAA JWT (via `SessionService`), and the backend re-checks every
 * request. The engine's job is purely to let the UI *adapt* — hiding what the user cannot use —
 * by answering scope, role-collection and requirement questions consistently in one place.
 *
 * Capabilities:
 * - **Scopes** — {@link hasScope}, {@link hasAllScopes}, {@link hasAnyScope}.
 * - **Role collections** with **inheritance** and **permission groups** — a collection is
 *   considered *held* when the user's scopes cover its fully-expanded scope set
 *   ({@link hasRoleCollection}, {@link getAssignedRoleCollections}).
 * - **Requirements** — {@link isSatisfied} evaluates the declarative {@link PermissionRequirement}
 *   attached to workspaces, modules, cards, actions and routes.
 * - **Future attributes** — {@link hasAttribute} reads XSUAA user attributes (empty today).
 * - **Caching** — expanded role-collection scope sets and per-collection "held" results are
 *   memoised for the lifetime of the engine instance (rebuilt on tenant/session change by
 *   constructing a new engine).
 *
 * The engine is immutable: a permission change (login, tenant switch) produces a new instance
 * rather than mutating an existing one, so cached answers can never go stale.
 */
export default class PermissionEngine {
  private readonly grantedScopes: ReadonlySet<Scope>;
  private readonly attributes: Readonly<Record<string, readonly string[]>>;
  private readonly definitionsById: ReadonlyMap<RoleCollectionId, RoleCollectionDefinition>;

  /** Cache: role collection id → its fully-expanded (inherited) scope set. */
  private readonly expandedScopeCache = new Map<RoleCollectionId, ReadonlySet<Scope>>();
  /** Cache: role collection id → whether the current user holds it. */
  private readonly heldCache = new Map<RoleCollectionId, boolean>();

  /**
   * @param context the current user's scopes and (optional) attributes.
   * @param definitions the role-collection catalogue (defaults to the declared {@link ROLE_COLLECTIONS}).
   */
  public constructor(
    context: PermissionContext,
    definitions: readonly RoleCollectionDefinition[] = ROLE_COLLECTIONS,
  ) {
    this.grantedScopes = new Set(context.scopes);
    this.attributes = context.attributes ?? {};
    this.definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  /**
   * @param scope the scope short-name.
   * @returns whether the user was granted the scope.
   */
  public hasScope(scope: Scope): boolean {
    return this.grantedScopes.has(scope);
  }

  /**
   * @param scopes the scopes to test.
   * @returns whether the user holds *every* listed scope (vacuously true for an empty list).
   */
  public hasAllScopes(scopes: readonly Scope[]): boolean {
    return scopes.every((scope) => this.grantedScopes.has(scope));
  }

  /**
   * @param scopes the scopes to test.
   * @returns whether the user holds *at least one* listed scope (false for an empty list).
   */
  public hasAnyScope(scopes: readonly Scope[]): boolean {
    return scopes.some((scope) => this.grantedScopes.has(scope));
  }

  /**
   * @returns the sorted list of scopes granted to the user (the "resolved permissions", §10).
   */
  public getResolvedScopes(): readonly Scope[] {
    return [...this.grantedScopes].sort();
  }

  /**
   * @param name the attribute name.
   * @param value the value to look for.
   * @returns whether the user's XSUAA attributes contain the value (always false today).
   */
  public hasAttribute(name: string, value: string): boolean {
    return this.attributes[name]?.includes(value) === true;
  }

  /**
   * Determines whether the user holds a role collection — i.e. their granted scopes cover the
   * collection's fully-expanded (inherited) scope set. An unknown collection id is treated as
   * not held.
   * @param id the role-collection id.
   * @returns whether the collection is effectively held.
   */
  public hasRoleCollection(id: RoleCollectionId): boolean {
    const cached = this.heldCache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const definition = this.definitionsById.get(id);
    const held = definition !== undefined && this.hasAllScopes([...this.expandScopes(definition)]);
    this.heldCache.set(id, held);
    return held;
  }

  /**
   * @returns every catalogued role collection the user effectively holds, in catalogue order (§10).
   */
  public getAssignedRoleCollections(): readonly RoleCollectionId[] {
    const assigned: RoleCollectionId[] = [];
    for (const definition of this.definitionsById.values()) {
      if (this.hasRoleCollection(definition.id)) {
        assigned.push(definition.id);
      }
    }
    return assigned;
  }

  /**
   * Evaluates a declarative requirement against the current user. See {@link PermissionRequirement}
   * for the exact AND/OR semantics. An empty or omitted requirement is satisfied by any user.
   * @param requirement the requirement to evaluate, or `undefined` for "no requirement".
   * @returns whether the requirement is satisfied.
   */
  public isSatisfied(requirement: PermissionRequirement | undefined): boolean {
    if (requirement === undefined) {
      return true;
    }
    const allOk = requirement.allScopes === undefined || this.hasAllScopes(requirement.allScopes);
    const anyScopeOk =
      requirement.anyScope === undefined ||
      requirement.anyScope.length === 0 ||
      this.hasAnyScope(requirement.anyScope);
    const anyCollectionOk =
      requirement.anyRoleCollection === undefined ||
      requirement.anyRoleCollection.length === 0 ||
      requirement.anyRoleCollection.some((id) => this.hasRoleCollection(id));
    return allOk && anyScopeOk && anyCollectionOk;
  }

  /**
   * Expands a role collection to the full set of scopes it confers, following {@link
   * RoleCollectionDefinition.inherits} transitively. Cycle-safe and memoised.
   * @param definition the collection to expand.
   * @returns the expanded scope set.
   */
  private expandScopes(definition: RoleCollectionDefinition): ReadonlySet<Scope> {
    const cached = this.expandedScopeCache.get(definition.id);
    if (cached !== undefined) {
      return cached;
    }
    const collected = new Set<Scope>();
    const visited = new Set<RoleCollectionId>();
    const visit = (current: RoleCollectionDefinition): void => {
      if (visited.has(current.id)) {
        return;
      }
      visited.add(current.id);
      for (const scope of current.scopes) {
        collected.add(scope);
      }
      for (const parentId of current.inherits ?? []) {
        const parent = this.definitionsById.get(parentId);
        if (parent !== undefined) {
          visit(parent);
        }
      }
    };
    visit(definition);
    this.expandedScopeCache.set(definition.id, collected);
    return collected;
  }
}
