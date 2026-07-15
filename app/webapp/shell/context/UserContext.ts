import Localization from "sap/base/i18n/Localization";
import AppEventBus from "../../core/events/AppEventBus";
import SessionService, { type SessionUser } from "../../core/services/auth/SessionService";
import ThemeService from "../../core/services/theme/ThemeService";
import TenantContext from "./TenantContext";
import FavoritesService, { type FavoritesSnapshot } from "../favorites/FavoritesService";
import PermissionEngine from "../permissions/PermissionEngine";
import type { Scope, RoleCollectionId } from "../permissions/RoleCollections";
import type { WorkspaceId } from "../registry/WorkspaceTypes";
import type { ModuleId } from "../../core/types/Module";
import type { TenantConfig } from "../../core/types/AppConfig";

/** The slice of {@link SessionService} the user context reads. Structural for testability. */
export interface SessionSource {
  getUser(): SessionUser;
}

/** The slice of {@link TenantContext} the user context reads. */
export interface TenantSource {
  getCurrentTenant(): TenantConfig | null;
}

/** The slice of {@link FavoritesService} the user context reads/records. */
export interface FavoritesSource {
  getSnapshot(): FavoritesSnapshot;
  recordRecentWorkspace(id: WorkspaceId): void;
}

/** The slice of {@link ThemeService} the user context reads. */
export interface ThemeSource {
  getActiveTheme(): string;
}

/** Constructor dependencies for {@link UserContext}, injectable in tests. */
export interface UserContextDeps {
  readonly session: SessionSource;
  readonly tenants: TenantSource;
  readonly favorites: FavoritesSource;
  readonly theme: ThemeSource;
}

/** Session-scoped metadata about the current sign-in. */
export interface SessionInfo {
  readonly userId: string;
  readonly authenticated: boolean;
  /** ISO timestamp the context was resolved (proxy for login time in this stateless app). */
  readonly resolvedAt: string;
}

/**
 * A flat, bindable projection of the whole user context — everything a view needs about "who is
 * here and what can they do" in one object (§10). Consumed by the shell and landing JSON models.
 */
export interface UserContextSnapshot {
  readonly displayName: string;
  readonly email: string;
  readonly userId: string;
  readonly currentTenant: TenantConfig | null;
  readonly currentWorkspaceId: WorkspaceId;
  readonly assignedRoleCollections: readonly RoleCollectionId[];
  readonly resolvedPermissions: readonly Scope[];
  readonly theme: string;
  readonly language: string;
  readonly favoriteWorkspaces: readonly WorkspaceId[];
  readonly favoriteModules: readonly ModuleId[];
  readonly recentWorkspaces: readonly WorkspaceId[];
  readonly recentModules: readonly ModuleId[];
  readonly session: SessionInfo;
}

/**
 * The user context service (§10) — the single aggregation point for the current user's identity,
 * permissions, tenant, workspace, theme, language and favorites. The whole application reads
 * "who is here / what can they do / where are they" through this one service rather than reaching
 * into `SessionService`, `PermissionEngine`, `TenantContext` and `FavoritesService` individually.
 *
 * It owns the live {@link PermissionEngine} (rebuilt on {@link initialize}, e.g. after a tenant
 * switch, so cached permission answers never go stale) and the "current workspace" pointer, and
 * delegates identity/tenant/favorites to their owning services. It holds no business logic and
 * knows nothing of Integration Suite.
 */
export default class UserContext {
  private static instance: UserContext | undefined;

  private permissionEngine = new PermissionEngine({ scopes: [] });
  private currentWorkspaceId: WorkspaceId = "";
  private resolvedAt = "";

  private constructor(
    private readonly session: SessionSource = SessionService.getInstance(),
    private readonly tenants: TenantSource = TenantContext.getInstance(),
    private readonly favorites: FavoritesSource = FavoritesService.getInstance(),
    private readonly theme: ThemeSource = ThemeService.getInstance(),
  ) {}

  /**
   * @returns the process-wide singleton user context.
   */
  public static getInstance(): UserContext {
    UserContext.instance ??= new UserContext();
    return UserContext.instance;
  }

  /**
   * Builds a non-singleton user context with injected dependencies. For tests only.
   * @param deps the injected sources.
   * @returns a fresh user context.
   */
  public static createForTest(deps: UserContextDeps): UserContext {
    return new UserContext(deps.session, deps.tenants, deps.favorites, deps.theme);
  }

  /**
   * Resolves the context from the loaded session and (re)builds the permission engine. Called once
   * during bootstrap and again whenever permissions must be recomputed. Broadcasts
   * `context:changed` so permission-gated navigation, landing cards and search re-evaluate.
   * @param reason a short label describing what triggered the (re)resolution.
   */
  public initialize(reason: string): void {
    const user = this.session.getUser();
    this.permissionEngine = new PermissionEngine({ scopes: user.scopes as readonly Scope[] });
    this.resolvedAt = new Date().toISOString();
    AppEventBus.getInstance().publish("context:changed", { reason });
  }

  /** @returns the live permission engine for permission checks. */
  public getPermissionEngine(): PermissionEngine {
    return this.permissionEngine;
  }

  /** @returns the raw session user. */
  public getUser(): SessionUser {
    return this.session.getUser();
  }

  /** @returns the user's display name. */
  public getDisplayName(): string {
    return this.session.getUser().name;
  }

  /** @returns the user's email. */
  public getEmail(): string {
    return this.session.getUser().email;
  }

  /** @returns the user's id (e.g. S-User / IAS id). */
  public getUserId(): string {
    return this.session.getUser().id;
  }

  /** @returns the currently selected tenant, or `null` before configuration is applied. */
  public getCurrentTenant(): TenantConfig | null {
    return this.tenants.getCurrentTenant();
  }

  /** @returns the id of the workspace the user is currently in ("" before any is opened). */
  public getCurrentWorkspaceId(): WorkspaceId {
    return this.currentWorkspaceId;
  }

  /**
   * Sets the active workspace, records it as recent and broadcasts `context:workspaceChanged`.
   * @param workspaceId the workspace now in focus.
   */
  public setCurrentWorkspace(workspaceId: WorkspaceId): void {
    if (workspaceId === this.currentWorkspaceId) {
      return;
    }
    this.currentWorkspaceId = workspaceId;
    this.favorites.recordRecentWorkspace(workspaceId);
    AppEventBus.getInstance().publish("context:workspaceChanged", { workspaceId });
  }

  /** @returns the role collections the user effectively holds. */
  public getAssignedRoleCollections(): readonly RoleCollectionId[] {
    return this.permissionEngine.getAssignedRoleCollections();
  }

  /** @returns the user's resolved scopes ("resolved permissions"). */
  public getResolvedPermissions(): readonly Scope[] {
    return this.permissionEngine.getResolvedScopes();
  }

  /** @returns the active UI5 theme id. */
  public getTheme(): string {
    return this.theme.getActiveTheme();
  }

  /** @returns the active UI language tag. */
  public getLanguage(): string {
    return Localization.getLanguage();
  }

  /** @returns session metadata for the current sign-in. */
  public getSessionInfo(): SessionInfo {
    const user = this.session.getUser();
    return { userId: user.id, authenticated: true, resolvedAt: this.resolvedAt };
  }

  /**
   * Builds a flat, bindable snapshot of the entire context for JSON models.
   * @returns the context snapshot.
   */
  public toSnapshot(): UserContextSnapshot {
    const favorites = this.favorites.getSnapshot();
    return {
      displayName: this.getDisplayName(),
      email: this.getEmail(),
      userId: this.getUserId(),
      currentTenant: this.getCurrentTenant(),
      currentWorkspaceId: this.currentWorkspaceId,
      assignedRoleCollections: this.getAssignedRoleCollections(),
      resolvedPermissions: this.getResolvedPermissions(),
      theme: this.getTheme(),
      language: this.getLanguage(),
      favoriteWorkspaces: favorites.favoriteWorkspaces,
      favoriteModules: favorites.favoriteModules,
      recentWorkspaces: favorites.recentWorkspaces,
      recentModules: favorites.recentModules,
      session: this.getSessionInfo(),
    };
  }
}
