import BaseComponent from "./core/base/BaseComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import type Event from "sap/ui/base/Event";
import ConfigService from "./core/services/config/ConfigService";
import SessionService from "./core/services/auth/SessionService";
import ThemeService from "./core/services/theme/ThemeService";
import ErrorHandler from "./core/errors/ErrorHandler";
import ClientLogger from "./core/logging/ClientLogger";
import ApplicationModel from "./core/models/ApplicationModel";
import ConfigurationModel from "./core/models/ConfigurationModel";
import ThemeModel from "./core/models/ThemeModel";
import UserModel from "./core/models/UserModel";
import TenantModel from "./core/models/TenantModel";
import NotificationModel from "./core/models/NotificationModel";
import TenantContext from "./shell/context/TenantContext";
import UserContext from "./shell/context/UserContext";
import NotificationCenter from "./shell/notifications/NotificationCenter";

/**
 * Root application component.
 *
 * Owns the shell-level router and the global models, and performs application bootstrap: it
 * registers global error handling, installs the six global models (placeholder state), then
 * asynchronously loads the runtime configuration and the user session, applies the configured
 * theme and client-logging settings, and populates the models. The shell view binds to the
 * `global` model's busy/bootstrap state until bootstrap completes.
 *
 * @namespace com.middlewareops.integrationportal
 */
export default class Component extends BaseComponent {
  public static readonly metadata = {
    manifest: "json",
    interfaces: ["sap.ui.core.IAsyncContentCreation"],
  };

  private errorHandler!: ErrorHandler;
  private applicationModel!: ApplicationModel;
  private configurationModel!: ConfigurationModel;
  private themeModel!: ThemeModel;
  private userModel!: UserModel;
  private tenantModel!: TenantModel;
  private notificationModel!: NotificationModel;

  /** Cache: module id → its resource model, attached to each module view as the view-scoped `i18n` model. */
  private moduleI18nModels: Map<string, ResourceModel> | undefined;

  /**
   * Component lifecycle hook. Sets up global state and error handling, kicks off bootstrap, and
   * initializes routing.
   *
   * NOTE: field initializers are not yet applied when `init()` runs — UI5's `.extend()`-based
   * construction invokes `init()` synchronously from within the base constructor, before any class
   * field initializer in this subclass executes. Anything needed here must be assigned inside this
   * method rather than as a field initializer (convention 4b, docs/SCAFFOLD_PROGRESS.md).
   */
  public init(): void {
    super.init();

    this.errorHandler = new ErrorHandler();
    this.errorHandler.registerGlobalHandlers();

    // Global models (placeholder state until bootstrap populates them).
    this.applicationModel = new ApplicationModel();
    this.configurationModel = new ConfigurationModel();
    this.themeModel = new ThemeModel();
    this.userModel = new UserModel();
    this.tenantModel = new TenantModel();
    this.notificationModel = new NotificationModel();
    this.setModel(this.applicationModel, "app");
    this.setModel(this.configurationModel, "configState");
    this.setModel(this.themeModel, "theme");
    this.setModel(this.userModel, "user");
    this.setModel(this.tenantModel, "tenant");
    this.setModel(this.notificationModel, "notifications");
    this.setModel(this.createGlobalModel(), "global");

    void this.bootstrap();
  }

  /**
   * @returns the shell-chrome model (busy/bootstrap state and legacy header bindings).
   */
  private createGlobalModel(): JSONModel {
    return new JSONModel({
      bootstrapped: false,
      busy: true,
      user: { name: "", email: "", scopes: [] as string[] },
      environmentLabel: "",
      unreadNotifications: 0,
    });
  }

  /**
   * Loads configuration and session in parallel, then applies platform settings (theme, client
   * logging) and populates the global models. Bootstrap failures are routed through the global
   * error handler.
   */
  private async bootstrap(): Promise<void> {
    const global = this.getModel("global") as JSONModel;
    const configService = ConfigService.getInstance();
    try {
      const [config, user] = await Promise.all([
        configService.load(),
        SessionService.getInstance().load(),
      ]);

      // Apply platform settings from configuration.
      ClientLogger.getInstance().configure(config.clientLogging);
      const activeTheme = ThemeService.getInstance().applyFromConfig(config.theme);

      // Populate the global models.
      this.applicationModel.applyConfig(config.application, config.environment, config.theme);
      this.configurationModel.applyConfig(config);
      this.themeModel.applyConfig(config.theme, activeTheme);
      this.userModel.applyUser(user);
      this.tenantModel.applyConfig(config.tenants, configService.getDefaultTenant());

      // Wire the shell context services to the now-populated global models, then resolve the user
      // context. Resolving publishes `context:changed`, which drives the shell chrome and landing
      // page to build their permission-gated navigation, cards and search.
      TenantContext.getInstance().initialize(this.tenantModel);
      NotificationCenter.getInstance().initialize(this.notificationModel);
      UserContext.getInstance().initialize("bootstrap");

      // Legacy shell-chrome bindings.
      global.setProperty("/user", user);
      global.setProperty("/environmentLabel", config.environment.label);
      global.setProperty("/bootstrapped", true);

      // Initialize the router AFTER configuration and session are loaded,
      // so module controllers can safely call ConfigService synchronously.
      const router = this.getRouter();
      router.attachRouteMatched(this.applyModuleI18n, this);
      router.initialize();
    } catch (error) {
      this.errorHandler.handle(error);
    } finally {
      global.setProperty("/busy", false);
    }
  }

  /**
   * On every route match, attaches the matched module's own i18n bundle to its view as the
   * view-scoped `i18n` model. In the single-root-component layout each module keeps its bundle at
   * `i18n/<module>/i18n.properties`, resolved by the module id embedded in the view name
   * (`…view.<module>.<Name>`). Set synchronously (before the deferred render) so `{i18n>…}` bindings
   * resolve without a flash. Non-module routes (home/shell) and any not-yet-migrated component
   * targets are skipped — they manage their own i18n model.
   */
  private applyModuleI18n(event: Event): void {
    const view = event.getParameter("view" as never) as
      | { getViewName?: () => string; setModel: (model: ResourceModel, name: string) => void }
      | undefined;
    const viewName = view?.getViewName?.() ?? "";
    const match = /\.view\.([^.]+)\./.exec(viewName);
    if (view === undefined || match === null || match[1] === undefined) {
      return;
    }
    const moduleId = match[1];
    this.moduleI18nModels ??= new Map<string, ResourceModel>();
    let model = this.moduleI18nModels.get(moduleId);
    if (model === undefined) {
      model = new ResourceModel({
        bundleName: `com.middlewareops.integrationportal.i18n.${moduleId}.i18n`,
        supportedLocales: [""],
        fallbackLocale: "",
      });
      this.moduleI18nModels.set(moduleId, model);
    }
    view.setModel(model, "i18n");
  }
}
