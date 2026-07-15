import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Fragment from "sap/ui/core/Fragment";
import ManagedObject from "sap/ui/base/ManagedObject";
import MessageToast from "sap/m/MessageToast";
import type Popover from "sap/m/Popover";
import type Control from "sap/ui/core/Control";
import type Context from "sap/ui/model/Context";
import type Event from "sap/ui/base/Event";
import ShellViewBuilder, { type TranslateFn } from "../model/ShellViewBuilder";
import UserContext from "../context/UserContext";
import TenantContext from "../context/TenantContext";
import BrandingService, {
  type BrandingInfo,
  type EnvironmentBanner,
  type TenantBanner,
} from "../branding/BrandingService";
import NavigationService from "../navigation/NavigationService";
import NotificationCenter from "../notifications/NotificationCenter";
import GlobalSearch from "../search/GlobalSearch";
import RouteGuard from "../navigation/RouteGuard";
import FavoritesService from "../favorites/FavoritesService";
import AppEventBus from "../../core/events/AppEventBus";
import { RouteNames } from "../../core/constants/RouteNames";
import { ShellCommands } from "../actions/QuickActionRegistry";
import type {
  BreadcrumbVM,
  NavWorkspaceVM,
  QuickActionVM,
  SidebarItemVM,
  TenantOptionVM,
} from "../model/ShellViewTypes";
import type { SearchResultItem } from "../search/SearchProvider";

/** Header user-profile projection. */
interface ShellUser {
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly roleCollections: readonly string[];
}

/** A global-search result group with its heading already translated, for declarative binding. */
interface SearchGroupVM {
  readonly title: string;
  readonly icon: string;
  readonly items: readonly SearchResultItem[];
}

/** The bindable state of the whole shell chrome. */
interface ShellState {
  branding: BrandingInfo;
  environment: EnvironmentBanner;
  tenantBanner: TenantBanner;
  workspaces: readonly NavWorkspaceVM[];
  activeWorkspaceId: string;
  sidebar: readonly SidebarItemVM[];
  breadcrumbs: readonly BreadcrumbVM[];
  quickActions: readonly QuickActionVM[];
  tenants: readonly TenantOptionVM[];
  user: ShellUser;
  unread: number;
  search: { query: string; groups: readonly SearchGroupVM[] };
}

/**
 * Controller for the application shell — the permanent, reusable container every module renders
 * into (§1). It composes the framework services through the pure {@link ShellViewBuilder} into a
 * `shell` view model and keeps the header (workspace navigation, tenant selector, global search,
 * quick actions, notifications, user profile), the dynamic sidebar and the breadcrumbs in sync with
 * the active route, the current user's permissions, the selected tenant and favorites.
 *
 * It holds **no business logic** and never touches Integration Suite: it reads an event, calls one
 * service, and rebinds. Routes are guarded by the {@link RouteGuard} (§12); the backend remains the
 * final authority.
 *
 * @namespace com.middlewareops.integrationportal.shell.controller
 */
export default class ShellController extends BaseController {
  private readonly builder = new ShellViewBuilder();
  private readonly userContext = UserContext.getInstance();
  private readonly tenantContext = TenantContext.getInstance();
  private readonly branding = BrandingService.getInstance();
  private readonly navigation = NavigationService.getInstance();
  private readonly notifications = NotificationCenter.getInstance();
  private readonly search = GlobalSearch.getInstance();
  private readonly favorites = FavoritesService.getInstance();
  private readonly routeGuard = new RouteGuard();

  private notificationPopover: Popover | undefined;
  private userPopover: Popover | undefined;
  private searchPopover: Popover | undefined;
  private tenantPopover: Popover | undefined;
  private searchAbort: AbortController | undefined;

  /**
   * Lifecycle hook: installs the shell model + density class, guards routes, tracks route changes
   * to keep the chrome current, and rebuilds the chrome on context/tenant/favorites/notification
   * changes.
   */
  public onInit(): void {
    this.getView()?.addStyleClass(
      (
        this.getOwnerComponent() as unknown as { getContentDensityClass(): string }
      ).getContentDensityClass(),
    );
    this.setModel(new JSONModel(this.emptyState()), "shell");

    const router = this.getRouter();
    router.attachRouteMatched((event) => this.onRouteMatched(event));
    this.routeGuard.install(router, (route) => this.onRouteDenied(route));

    const bus = AppEventBus.getInstance();
    bus.subscribe("context:changed", () => this.rebuildChrome(this.currentRoute()), this);
    bus.subscribe("context:favoritesChanged", () => this.rebuildChrome(this.currentRoute()), this);
    bus.subscribe("session:tenantChanged", () => this.rebuildChrome(this.currentRoute()), this);
    bus.subscribe("context:shellCommand", (payload) => this.onShellCommand(payload.command), this);

    this.rebuildChrome("");
  }

  private onRouteMatched(event: Event): void {
    const route = event.getParameter("name" as never) as unknown as string;
    const module = this.navigation.findModuleByRoute(route);
    if (module !== undefined) {
      this.userContext.setCurrentWorkspace(module.workspace);
      this.favorites.recordRecentModule(module.id);
    }
    this.rebuildChrome(route);
  }

  private onRouteDenied(route: string): void {
    MessageToast.show(this.getText("shell.route.denied"));
    this.getRouter().navTo(RouteNames.Home, undefined, true);
    this.rebuildChrome(route);
  }

  private rebuildChrome(route: string): void {
    const model = this.getModel("shell") as JSONModel | undefined;
    if (model === undefined) {
      return;
    }
    try {
      model.setData(this.buildState(route));
    } catch {
      // Configuration/session not ready yet; a later context:changed rebuilds successfully.
    }
  }

  private buildState(route: string): ShellState {
    const engine = this.userContext.getPermissionEngine();
    const translate: TranslateFn = (key, args) => this.getText(key, args);
    const module = route === "" ? undefined : this.navigation.findModuleByRoute(route);
    const activeWorkspaceId = module?.workspace ?? "";

    return {
      branding: this.branding.getBranding(),
      environment: this.branding.getEnvironmentBanner(),
      tenantBanner: this.branding.getTenantBanner(),
      workspaces: this.builder.buildWorkspaceNav(engine, activeWorkspaceId, translate),
      activeWorkspaceId,
      sidebar:
        activeWorkspaceId === ""
          ? []
          : this.builder.buildSidebar(activeWorkspaceId, engine, translate),
      breadcrumbs: this.builder.buildBreadcrumbs(activeWorkspaceId, route, translate),
      quickActions: this.builder.buildQuickActions(engine, translate),
      tenants: this.buildTenantOptions(),
      user: this.buildUser(),
      unread: this.safeUnread(),
      search: { query: "", groups: [] },
    };
  }

  private buildTenantOptions(): readonly TenantOptionVM[] {
    const currentId = this.tenantContext.getCurrentTenantId();
    return this.tenantContext.getSelectableTenants().map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      color: tenant.displayColor,
      icon: tenant.displayIcon,
      selected: tenant.id === currentId,
    }));
  }

  private buildUser(): ShellUser {
    const name = this.userContext.getDisplayName();
    return {
      name,
      email: this.userContext.getEmail(),
      initials: ShellController.initialsOf(name),
      roleCollections: this.userContext.getAssignedRoleCollections(),
    };
  }

  private safeUnread(): number {
    try {
      return this.notifications.getUnreadCount();
    } catch {
      return 0;
    }
  }

  // --- Header interactions --------------------------------------------------

  /**
   * Switches the active workspace from the header workspace selector by navigating to its default
   * route (no page reload — the module container simply swaps).
   * @param event the selection-change event.
   */
  public onWorkspaceSelect(event: Event): void {
    const key = (
      event.getParameter("selectedItem" as never) as { getKey(): string } | undefined
    )?.getKey();
    if (key === undefined || key === "") {
      return;
    }
    const workspace = this.builder
      .buildWorkspaceNav(this.userContext.getPermissionEngine(), key, (k) => this.getText(k))
      .find((entry) => entry.id === key);
    if (workspace !== undefined) {
      this.navTo(workspace.defaultRoute);
    }
  }

  /**
   * Handles a sidebar module selection by navigating to its route.
   * @param event the `itemSelect` event.
   */
  public onNavItemSelect(event: Event): void {
    const item = event.getParameter("item" as never) as { getKey(): string } | undefined;
    const route = item?.getKey();
    if (route !== undefined && route !== "") {
      this.navTo(route);
    }
  }

  /**
   * Navigates from a breadcrumb crumb.
   * @param event the breadcrumb link press event.
   */
  public onBreadcrumbPress(event: Event): void {
    const crumb = ShellController.contextObject<BreadcrumbVM>(event, "shell");
    if (crumb !== undefined && crumb.route !== "") {
      this.navTo(crumb.route);
    }
  }

  /**
   * Dispatches a quick action (§16).
   * @param event the menu item / button press event.
   */
  public onQuickActionPress(event: Event): void {
    const action = ShellController.contextObject<QuickActionVM>(event, "shell");
    if (action === undefined) {
      return;
    }
    if (action.kind === "openWorkspace" && action.workspaceId !== undefined) {
      const nav = this.builder
        .buildWorkspaceNav(this.userContext.getPermissionEngine(), "", (k) => this.getText(k))
        .find((entry) => entry.id === action.workspaceId);
      if (nav !== undefined) {
        this.navTo(nav.defaultRoute);
      }
    } else if (action.kind === "navigate" && action.route !== undefined) {
      this.navTo(action.route);
    } else if (action.kind === "command" && action.command !== undefined) {
      this.onShellCommand(action.command);
    }
  }

  /**
   * Opens the tenant selector popover (§11).
   * @param event the tenant button press event.
   */
  public async onTenantPress(event: Event): Promise<void> {
    await this.openTenantPopover(event.getSource() as Control);
  }

  /**
   * Switches the tenant from the header tenant menu (§11). The change broadcasts, so permissions,
   * navigation and monitoring modules reload without any wiring here.
   * @param event the tenant menu item press event.
   */
  public onTenantSelect(event: Event): void {
    const tenant = ShellController.contextObject<TenantOptionVM>(event, "shell");
    if (tenant !== undefined && this.tenantContext.switchTenant(tenant.id)) {
      this.userContext.initialize("tenantChanged");
      MessageToast.show(this.getText("shell.tenant.switched", [tenant.name]));
    }
    this.tenantPopover?.close();
  }

  /** Navigates to the landing (home) page. */
  public onHomePress(): void {
    this.navTo(RouteNames.Home);
  }

  /** Collapses/expands the side navigation. */
  public onMenuToggle(): void {
    const toolPage = this.byId("toolPage") as unknown as
      | { getSideExpanded(): boolean; setSideExpanded(v: boolean): void }
      | undefined;
    toolPage?.setSideExpanded(!toolPage.getSideExpanded());
  }

  /**
   * Runs a global search across authorized providers and shows the grouped results (§14).
   * @param event the search field `search` event.
   */
  public async onSearch(event: Event): Promise<void> {
    const query = (event.getParameter("query" as never) as string | undefined) ?? "";
    const model = this.getModel("shell") as JSONModel;
    model.setProperty("/search/query", query);
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();
    const groups = await this.search.search(
      query,
      this.userContext.getPermissionEngine(),
      this.searchAbort.signal,
    );
    const resolved: SearchGroupVM[] = groups.map((group) => ({
      title: this.getText(group.titleKey),
      icon: group.icon,
      items: group.items,
    }));
    model.setProperty("/search/groups", resolved);
    await this.openSearchPopover(event.getSource() as Control);
  }

  /**
   * Handles a search result selection by navigating to its route.
   * @param event the result list item press event.
   */
  public onSearchResultPress(event: Event): void {
    const item = ShellController.contextObject<{ route?: string }>(event, "shell");
    if (item?.route !== undefined && item.route !== "") {
      this.navTo(item.route);
      this.searchPopover?.close();
    }
  }

  /**
   * Opens the notification center popover, marking everything read (§13).
   * @param event the bell button press event.
   */
  public async onNotificationPress(event: Event): Promise<void> {
    const source = event.getSource() as Control;
    this.notificationPopover ??= (await this.loadPopover("NotificationPanel")) as Popover;
    this.addDependent(this.notificationPopover);
    this.notificationPopover.openBy(source);
    try {
      this.notifications.markAllRead();
    } catch {
      // Notification center not initialized yet (pre-bootstrap); nothing to mark.
    }
    this.rebuildChrome(this.currentRoute());
  }

  /**
   * Dismisses a single notification from the center.
   * @param event the dismiss button press event.
   */
  public onNotificationDismiss(event: Event): void {
    const item = ShellController.contextObject<{ id: string }>(event, "notifications");
    if (item !== undefined) {
      this.notifications.dismiss(item.id);
      this.rebuildChrome(this.currentRoute());
    }
  }

  /** Clears all notifications. */
  public onNotificationClear(): void {
    this.notifications.clear();
    this.rebuildChrome(this.currentRoute());
  }

  /**
   * Opens the user-profile popover (§1, §10).
   * @param event the user button press event.
   */
  public async onUserPress(event: Event): Promise<void> {
    const source = event.getSource() as Control;
    this.userPopover ??= (await this.loadPopover("UserMenu")) as Popover;
    this.addDependent(this.userPopover);
    this.userPopover.openBy(source);
  }

  private onShellCommand(command: string): void {
    if (command === ShellCommands.SwitchTenant) {
      const button = this.byId("tenantButton") as Control | undefined;
      if (button !== undefined) {
        void this.openTenantPopover(button);
      }
    } else if (command === ShellCommands.OpenSearch) {
      this.focusSearch();
    } else if (command === ShellCommands.OpenNotifications) {
      const bell = this.byId("notificationButton") as Control | undefined;
      if (bell !== undefined) {
        void this.onNotificationPress({ getSource: () => bell } as unknown as Event);
      }
    }
  }

  private async openTenantPopover(source: Control): Promise<void> {
    this.tenantPopover ??= (await this.loadPopover("TenantMenu")) as Popover;
    this.addDependent(this.tenantPopover);
    this.tenantPopover.openBy(source);
  }

  private focusSearch(): void {
    const field = this.byId("globalSearch") as unknown as { focus(): void } | undefined;
    field?.focus();
  }

  private async openSearchPopover(source: Control): Promise<void> {
    this.searchPopover ??= (await this.loadPopover("SearchResults")) as Popover;
    this.addDependent(this.searchPopover);
    if (!this.searchPopover.isOpen()) {
      this.searchPopover.openBy(source);
    }
  }

  private async loadPopover(name: string): Promise<Control> {
    return (await Fragment.load({
      id: this.getView()?.getId(),
      name: `com.middlewareops.integrationportal.shell.fragments.${name}`,
      controller: this,
    })) as Control;
  }

  private addDependent(control: Control): void {
    this.getView()?.addDependent(control);
  }

  private currentRoute(): string {
    const hash = this.getRouter().getHashChanger().getHash();
    const info = this.getRouter().getRouteInfoByHash(hash) as { name?: string } | undefined;
    return info?.name ?? "";
  }

  private emptyState(): ShellState {
    return {
      branding: this.branding.emptyBranding(),
      environment: { label: "", kind: "", show: false },
      tenantBanner: { name: "", color: "", icon: "", show: false },
      workspaces: [],
      activeWorkspaceId: "",
      sidebar: [],
      breadcrumbs: [],
      quickActions: [],
      tenants: [],
      user: { name: "", email: "", initials: "", roleCollections: [] },
      unread: 0,
      search: { query: "", groups: [] },
    };
  }

  private static initialsOf(name: string): string {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      return "";
    }
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
    return (first + last).toUpperCase();
  }

  private static contextObject<T>(event: Event, model: string): T | undefined {
    const source = event.getSource();
    if (!(source instanceof ManagedObject)) {
      return undefined;
    }
    const context: Context | null | undefined = source.getBindingContext(model);
    return (context?.getObject() as T | undefined) ?? undefined;
  }
}
