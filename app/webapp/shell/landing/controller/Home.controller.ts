import BaseController from "../../../core/base/BaseController";
import ManagedObject from "sap/ui/base/ManagedObject";
import type Event from "sap/ui/base/Event";
import type Context from "sap/ui/model/Context";
import HomeModel, { type HomeState } from "../model/HomeModel";
import ShellViewBuilder, { type TranslateFn } from "../../model/ShellViewBuilder";
import UserContext from "../../context/UserContext";
import BrandingService from "../../branding/BrandingService";
import FavoritesService from "../../favorites/FavoritesService";
import WorkspaceRegistry from "../../registry/WorkspaceRegistry";
import AppEventBus from "../../../core/events/AppEventBus";
import ClientLogger, { type CategoryLogger } from "../../../core/logging/ClientLogger";
import { Severity } from "../../../core/constants/Severity";
import type {
  AnnouncementVM,
  ModuleCardVM,
  QuickActionVM,
  WorkspaceCardVM,
} from "../../model/ShellViewTypes";

/**
 * Controller for the landing (home) page (§2) — the user's home, not a dashboard and not
 * monitoring. It composes the framework services through the pure {@link ShellViewBuilder} into the
 * {@link HomeModel} and rebuilds whenever the user context, tenant or favorites change, so favorite
 * and recent workspaces, available workspaces, quick actions and branding always reflect the live
 * context. It holds no business logic and knows nothing of Integration Suite.
 *
 * @namespace com.middlewareops.integrationportal.shell.landing.controller
 */
export default class HomeController extends BaseController {
  private readonly logger: CategoryLogger = ClientLogger.getLogger("shell.home");
  private readonly builder = new ShellViewBuilder();
  private readonly userContext = UserContext.getInstance();
  private readonly branding = BrandingService.getInstance();
  private readonly favorites = FavoritesService.getInstance();
  private readonly registry = WorkspaceRegistry.getInstance();
  private homeModel = new HomeModel();

  /**
   * Lifecycle hook: installs the home model, subscribes to context/tenant/favorites changes and
   * refreshes on every visit to the home route.
   */
  public onInit(): void {
    this.homeModel = new HomeModel();
    this.setModel(this.homeModel, "home");

    const bus = AppEventBus.getInstance();
    bus.subscribe("context:changed", () => this.refresh(), this);
    bus.subscribe("context:favoritesChanged", () => this.refresh(), this);
    bus.subscribe("session:tenantChanged", () => this.refresh(), this);
    this.getRouter()
      .getRoute("home")
      ?.attachPatternMatched(() => this.refresh(), this);

    this.refresh();
  }

  /**
   * Rebuilds the entire landing state from the framework services. Resilient to being called before
   * bootstrap completes (configuration not yet loaded): it logs and leaves the empty state, and the
   * subsequent `context:changed` triggers a successful rebuild.
   */
  private refresh(): void {
    try {
      this.homeModel.apply(this.buildState());
    } catch (error) {
      this.logger.debug("Home not ready yet; deferring render", { reason: String(error) });
    }
  }

  private buildState(): HomeState {
    const engine = this.userContext.getPermissionEngine();
    const translate: TranslateFn = (key, args) => this.getText(key, args);
    const branding = this.branding.getBranding();
    const environment = this.branding.getEnvironmentBanner();

    return {
      loaded: true,
      welcome: this.getText(HomeController.greetingKey(), [this.userContext.getDisplayName()]),
      subtitle: this.getText("home.subtitle"),
      displayName: this.userContext.getDisplayName(),
      userId: this.userContext.getUserId(),
      email: this.userContext.getEmail(),
      language: this.userContext.getLanguage(),
      version: branding.version,
      roleCollections: this.userContext.getAssignedRoleCollections(),
      tenant: this.branding.getTenantBanner(),
      environment,
      branding,
      theme: { activeTheme: this.userContext.getTheme(), accentColor: branding.accentColor },
      health: this.buildHealth(environment.show),
      favoriteWorkspaces: this.builder.buildFavoriteWorkspaceCards(engine, translate),
      recentWorkspaces: this.builder.buildRecentWorkspaceCards(engine, translate),
      availableWorkspaces: this.builder.buildLandingWorkspaceCards(engine, translate),
      recentModules: this.builder.buildRecentModuleCards(engine, translate),
      quickActions: this.builder.buildQuickActions(engine, translate),
      announcements: this.buildAnnouncements(environment.show),
    };
  }

  private buildHealth(nonProduction: boolean): HomeState["health"] {
    return nonProduction
      ? { state: "Information", text: this.getText("home.health.nonProduction") }
      : { state: "Success", text: this.getText("home.health.operational") };
  }

  private buildAnnouncements(nonProduction: boolean): readonly AnnouncementVM[] {
    const announcements: AnnouncementVM[] = [];
    if (nonProduction) {
      announcements.push({
        id: "env",
        title: this.getText("home.announcement.env.title"),
        text: this.getText("home.announcement.env.text"),
        severity: Severity.Warning,
      });
    }
    return announcements;
  }

  /**
   * Opens a workspace from a landing card by navigating to its default route; the shell's route
   * handling then activates the workspace, updates recents, sidebar and breadcrumbs.
   * @param event the card press event.
   */
  public onWorkspaceCardPress(event: Event): void {
    const card = HomeController.objectFrom<WorkspaceCardVM>(event);
    if (card !== undefined) {
      this.navTo(card.defaultRoute);
    }
  }

  /**
   * Toggles a workspace as favorite from its landing card.
   * @param event the toggle button press event.
   */
  public onToggleFavoriteWorkspace(event: Event): void {
    const card = HomeController.objectFrom<WorkspaceCardVM>(event);
    if (card !== undefined) {
      this.favorites.toggleFavoriteWorkspace(card.id);
    }
  }

  /**
   * Opens a recently-visited module.
   * @param event the module card press event.
   */
  public onModuleCardPress(event: Event): void {
    const card = HomeController.objectFrom<ModuleCardVM>(event);
    if (card !== undefined) {
      this.navTo(card.route);
    }
  }

  /**
   * Dispatches a quick action (§16): open a workspace, navigate to a route, or raise a shell
   * command for the chrome to handle.
   * @param event the quick-action press event.
   */
  public onQuickActionPress(event: Event): void {
    const action = HomeController.objectFrom<QuickActionVM>(event);
    if (action === undefined) {
      return;
    }
    if (action.kind === "openWorkspace" && action.workspaceId !== undefined) {
      const workspace = this.registry.getWorkspace(action.workspaceId);
      if (workspace !== undefined) {
        this.navTo(workspace.defaultRoute);
      }
    } else if (action.kind === "navigate" && action.route !== undefined) {
      this.navTo(action.route);
    } else if (action.kind === "command" && action.command !== undefined) {
      AppEventBus.getInstance().publish("context:shellCommand", { command: action.command });
    }
  }

  private static greetingKey(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "home.greeting.morning";
    }
    return hour < 18 ? "home.greeting.afternoon" : "home.greeting.evening";
  }

  private static objectFrom<T>(event: Event): T | undefined {
    const source = event.getSource();
    if (!(source instanceof ManagedObject)) {
      return undefined;
    }
    const context: Context | null | undefined = source.getBindingContext("home");
    return (context?.getObject() as T | undefined) ?? undefined;
  }
}
