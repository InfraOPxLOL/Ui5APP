import WorkspaceRegistry from "../registry/WorkspaceRegistry";
import ConfigService from "../../core/services/config/ConfigService";
import type {
  RegisteredModule,
  WorkspaceDefinition,
  WorkspaceId,
} from "../registry/WorkspaceTypes";
import type { ModuleId } from "../../core/types/Module";
import type PermissionEngine from "../permissions/PermissionEngine";

/**
 * The slice of {@link ConfigService} the navigation depends on: module enablement and feature
 * flags. Declared structurally so a fake can be injected in tests without a loaded configuration.
 */
export interface ModuleEnablement {
  isModuleEnabled(moduleId: ModuleId): boolean;
  isFeatureEnabled(flag: string): boolean;
}

/**
 * Resolves the **dynamic navigation** (§8) by combining three inputs the {@link WorkspaceRegistry}
 * deliberately knows nothing about: config-driven module enablement + feature flags
 * ({@link ConfigService}), and the current user's permissions ({@link PermissionEngine}).
 *
 * A module is:
 * - **enabled** when its `config.json` toggle is on and its optional feature flag (if any) is on;
 * - **authorized** when it is enabled and its permission requirement is satisfied — the rule for
 *   whether its route may activate and whether it may appear in global search (§12);
 * - **visible** when it is authorized and flagged `showInSidebar` — the rule for the sidebar.
 *
 * A workspace is visible when its own permission is satisfied and it has at least one visible
 * module, so empty or fully-unauthorized workspaces never render (§12). The service is pure (no
 * view, no i18n): it returns metadata the shell maps to controls.
 */
export default class NavigationService {
  private static instance: NavigationService | undefined;

  /**
   * @param registry the workspace/module registry (defaults to the singleton).
   * @param config the module-enablement source (defaults to the config service).
   */
  public constructor(
    private readonly registry: WorkspaceRegistry = WorkspaceRegistry.getInstance(),
    private readonly config: ModuleEnablement = ConfigService.getInstance(),
  ) {}

  /**
   * @returns the process-wide singleton navigation service.
   */
  public static getInstance(): NavigationService {
    NavigationService.instance ??= new NavigationService();
    return NavigationService.instance;
  }

  /**
   * @param module the module to test.
   * @returns whether the module is enabled by configuration and its feature flag.
   */
  public isModuleEnabled(module: RegisteredModule): boolean {
    if (!this.config.isModuleEnabled(module.id)) {
      return false;
    }
    return module.featureFlag === undefined || this.config.isFeatureEnabled(module.featureFlag);
  }

  /**
   * @param module the module to test.
   * @param engine the current user's permission engine.
   * @returns whether the module's route may activate / appear in search (enabled + permitted).
   */
  public isModuleAuthorized(module: RegisteredModule, engine: PermissionEngine): boolean {
    return this.isModuleEnabled(module) && engine.isSatisfied(module.permission);
  }

  /**
   * @param module the module to test.
   * @param engine the current user's permission engine.
   * @returns whether the module should appear in the sidebar (authorized + `showInSidebar`).
   */
  public isModuleVisible(module: RegisteredModule, engine: PermissionEngine): boolean {
    return module.showInSidebar && this.isModuleAuthorized(module, engine);
  }

  /**
   * @param workspaceId the workspace whose sidebar is being built.
   * @param engine the current user's permission engine.
   * @returns the workspace's sidebar modules, ordered by navigation order.
   */
  public getVisibleModules(
    workspaceId: WorkspaceId,
    engine: PermissionEngine,
  ): readonly RegisteredModule[] {
    return this.registry
      .getModulesForWorkspace(workspaceId)
      .filter((module) => this.isModuleVisible(module, engine));
  }

  /**
   * @param workspace the workspace to test.
   * @param engine the current user's permission engine.
   * @returns whether the workspace's own permission is satisfied.
   */
  public isWorkspacePermitted(workspace: WorkspaceDefinition, engine: PermissionEngine): boolean {
    return engine.isSatisfied(workspace.permission);
  }

  /**
   * @param engine the current user's permission engine.
   * @returns the workspaces to show in workspace navigation: permitted, `showInSidebar`, and with
   * at least one visible module.
   */
  public getVisibleWorkspaces(engine: PermissionEngine): readonly WorkspaceDefinition[] {
    return this.registry
      .getWorkspaces()
      .filter(
        (workspace) =>
          workspace.showInSidebar &&
          this.isWorkspacePermitted(workspace, engine) &&
          this.getVisibleModules(workspace.id, engine).length > 0,
      );
  }

  /**
   * @param engine the current user's permission engine.
   * @returns the workspaces to show as landing cards (§9): `showOnLanding`, permitted, and with at
   * least one authorized module.
   */
  public getLandingWorkspaces(engine: PermissionEngine): readonly WorkspaceDefinition[] {
    return this.registry
      .getWorkspaces()
      .filter(
        (workspace) =>
          workspace.showOnLanding &&
          this.isWorkspacePermitted(workspace, engine) &&
          this.registry
            .getModulesForWorkspace(workspace.id)
            .some((module) => this.isModuleAuthorized(module, engine)),
      );
  }

  /**
   * @param engine the current user's permission engine.
   * @returns the modules flagged `showLandingCard` that the user is authorized for, ordered by
   * workspace then navigation order.
   */
  public getLandingModules(engine: PermissionEngine): readonly RegisteredModule[] {
    return this.registry
      .getWorkspaces()
      .flatMap((workspace) =>
        this.registry
          .getModulesForWorkspace(workspace.id)
          .filter((module) => module.showLandingCard && this.isModuleAuthorized(module, engine)),
      );
  }

  /**
   * Finds the registered module a route belongs to.
   * @param route the route name.
   * @returns the module, or `undefined` when the route is not a module route (e.g. home/workspace).
   */
  public findModuleByRoute(route: string): RegisteredModule | undefined {
    return this.registry.getRegisteredModules().find((module) => module.route === route);
  }
}
