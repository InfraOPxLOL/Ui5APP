import NavigationService from "../navigation/NavigationService";
import WorkspaceRegistry from "../registry/WorkspaceRegistry";
import FavoritesService from "../favorites/FavoritesService";
import QuickActionRegistry from "../actions/QuickActionRegistry";
import type PermissionEngine from "../permissions/PermissionEngine";
import type {
  RegisteredModule,
  WorkspaceDefinition,
  WorkspaceId,
} from "../registry/WorkspaceTypes";
import type {
  BreadcrumbVM,
  ModuleCardVM,
  NavWorkspaceVM,
  QuickActionVM,
  SidebarItemVM,
  WorkspaceCardVM,
} from "./ShellViewTypes";

/** Resolves an i18n key (and optional placeholders) to text — the controller's `getText`. */
export type TranslateFn = (key: string, args?: (string | number)[]) => string;

/**
 * Pure builder that turns the framework services (navigation, permissions, favorites, quick
 * actions) into the resolved {@link module:shell/model/ShellViewTypes} view models the shell and
 * landing views bind to.
 *
 * It is deliberately free of UI5 dependencies and takes the current {@link PermissionEngine} and a
 * {@link TranslateFn} as parameters, so the entire landing/navigation mapping is unit-testable
 * (§19) and shared by both the {@link module:shell/controller/Shell} and
 * {@link module:shell/landing/controller/Home} controllers with zero duplication.
 */
export default class ShellViewBuilder {
  /**
   * @param navigation resolves visibility/authorization.
   * @param registry the workspace/module registry.
   * @param favorites favorites and recents.
   * @param quickActions the quick-action registry.
   */
  public constructor(
    private readonly navigation: NavigationService = NavigationService.getInstance(),
    private readonly registry: WorkspaceRegistry = WorkspaceRegistry.getInstance(),
    private readonly favorites: FavoritesService = FavoritesService.getInstance(),
    private readonly quickActions: QuickActionRegistry = QuickActionRegistry.getInstance(),
  ) {}

  /**
   * @param engine current permission engine.
   * @param activeWorkspaceId the workspace currently in focus (for selection state).
   * @param translate i18n resolver.
   * @returns the visible workspaces for the top-level workspace navigation (§8).
   */
  public buildWorkspaceNav(
    engine: PermissionEngine,
    activeWorkspaceId: WorkspaceId,
    translate: TranslateFn,
  ): readonly NavWorkspaceVM[] {
    return this.navigation.getVisibleWorkspaces(engine).map((workspace) => ({
      id: workspace.id,
      title: translate(workspace.titleKey),
      icon: workspace.icon,
      accent: workspace.themeAccent,
      defaultRoute: workspace.defaultRoute,
      selected: workspace.id === activeWorkspaceId,
    }));
  }

  /**
   * @param workspaceId the active workspace.
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns the sidebar module items for the active workspace (§8).
   */
  public buildSidebar(
    workspaceId: WorkspaceId,
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly SidebarItemVM[] {
    return this.navigation.getVisibleModules(workspaceId, engine).map((module) => ({
      moduleId: module.id,
      title: translate(module.titleKey),
      icon: module.icon,
      route: module.route,
    }));
  }

  /**
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns landing cards for every workspace the user may enter (§9).
   */
  public buildLandingWorkspaceCards(
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly WorkspaceCardVM[] {
    return this.navigation
      .getLandingWorkspaces(engine)
      .map((workspace) => this.toWorkspaceCard(workspace, engine, translate));
  }

  /**
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns cards for the user's favorite workspaces that are still visible (§2, §15).
   */
  public buildFavoriteWorkspaceCards(
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly WorkspaceCardVM[] {
    return this.favorites
      .getSnapshot()
      .favoriteWorkspaces.map((id) => this.registry.getWorkspace(id))
      .filter((workspace): workspace is WorkspaceDefinition => workspace !== undefined)
      .filter((workspace) => this.isWorkspaceVisible(workspace, engine))
      .map((workspace) => this.toWorkspaceCard(workspace, engine, translate));
  }

  /**
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns cards for the user's recently-visited workspaces that are still visible (§2, §15).
   */
  public buildRecentWorkspaceCards(
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly WorkspaceCardVM[] {
    return this.favorites
      .getSnapshot()
      .recentWorkspaces.map((id) => this.registry.getWorkspace(id))
      .filter((workspace): workspace is WorkspaceDefinition => workspace !== undefined)
      .filter((workspace) => this.isWorkspaceVisible(workspace, engine))
      .map((workspace) => this.toWorkspaceCard(workspace, engine, translate));
  }

  /**
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns cards for the user's recently-visited modules that are still authorized (§2, §15).
   */
  public buildRecentModuleCards(
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly ModuleCardVM[] {
    const byId = new Map<string, RegisteredModule>(
      this.registry.getRegisteredModules().map((module) => [module.id, module]),
    );
    return this.favorites
      .getSnapshot()
      .recentModules.map((id) => byId.get(id))
      .filter((module): module is RegisteredModule => module !== undefined)
      .filter((module) => this.navigation.isModuleAuthorized(module, engine))
      .map((module) => ({
        moduleId: module.id,
        title: translate(module.titleKey),
        icon: module.icon,
        route: module.route,
        workspaceTitle: this.workspaceTitle(module.workspace, translate),
        favorite: this.favorites.isFavoriteModule(module.id),
      }));
  }

  /**
   * @param engine current permission engine.
   * @param translate i18n resolver.
   * @returns the authorized quick actions with their pinned state (§16).
   */
  public buildQuickActions(
    engine: PermissionEngine,
    translate: TranslateFn,
  ): readonly QuickActionVM[] {
    return this.quickActions.getAuthorizedActions(engine).map((action) => ({
      id: action.id,
      title: translate(action.titleKey),
      icon: action.icon,
      kind: action.kind,
      workspaceId: action.workspaceId,
      route: action.route,
      command: action.command,
      pinned: this.favorites.isPinnedAction(action.id),
    }));
  }

  /**
   * @param workspaceId the active workspace, or "" on the home page.
   * @param moduleRoute the active module route, or "" when none.
   * @param translate i18n resolver.
   * @returns the breadcrumb trail Home ▸ Workspace ▸ Module.
   */
  public buildBreadcrumbs(
    workspaceId: WorkspaceId,
    moduleRoute: string,
    translate: TranslateFn,
  ): readonly BreadcrumbVM[] {
    const crumbs: BreadcrumbVM[] = [{ text: translate("shell.home"), route: "home" }];
    const workspace = workspaceId === "" ? undefined : this.registry.getWorkspace(workspaceId);
    if (workspace !== undefined) {
      crumbs.push({ text: translate(workspace.titleKey), route: workspace.defaultRoute });
    }
    const module = moduleRoute === "" ? undefined : this.navigation.findModuleByRoute(moduleRoute);
    if (module !== undefined) {
      crumbs.push({ text: translate(module.titleKey), route: "" });
    }
    return crumbs.map((crumb, index) =>
      index === crumbs.length - 1 ? { text: crumb.text, route: "" } : crumb,
    );
  }

  private toWorkspaceCard(
    workspace: WorkspaceDefinition,
    engine: PermissionEngine,
    translate: TranslateFn,
  ): WorkspaceCardVM {
    const moduleCount = this.registry
      .getModulesForWorkspace(workspace.id)
      .filter((module) => this.navigation.isModuleAuthorized(module, engine)).length;
    return {
      id: workspace.id,
      title: translate(workspace.titleKey),
      description: translate(workspace.descriptionKey),
      icon: workspace.icon,
      accent: workspace.themeAccent,
      defaultRoute: workspace.defaultRoute,
      moduleCount,
      favorite: this.favorites.isFavoriteWorkspace(workspace.id),
      status: translate("home.card.status", [moduleCount]),
    };
  }

  private isWorkspaceVisible(workspace: WorkspaceDefinition, engine: PermissionEngine): boolean {
    return (
      this.navigation.isWorkspacePermitted(workspace, engine) &&
      this.registry
        .getModulesForWorkspace(workspace.id)
        .some((module) => this.navigation.isModuleAuthorized(module, engine))
    );
  }

  private workspaceTitle(workspaceId: WorkspaceId, translate: TranslateFn): string {
    const workspace = this.registry.getWorkspace(workspaceId);
    return workspace === undefined ? "" : translate(workspace.titleKey);
  }
}
