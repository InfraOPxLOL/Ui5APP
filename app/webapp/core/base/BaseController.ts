import Controller from "sap/ui/core/mvc/Controller";
import Component from "sap/ui/core/Component";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/ui/core/routing/Router";
import History from "sap/ui/core/routing/History";
import Model from "sap/ui/model/Model";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ErrorHandler from "../errors/ErrorHandler";
import { RouteNames } from "../constants/RouteNames";

/**
 * Abstract base class for **every** controller in the application (shell and all modules).
 *
 * It provides the thin, framework-level plumbing controllers repeatedly need — router access,
 * i18n text resolution, model access, navigation and a shared {@link ErrorHandler} — so concrete
 * controllers stay focused on orchestration. Per the architecture, controllers contain **no
 * business logic**: they read an event, call one service method, and bind the result. Anything
 * heavier belongs in a service.
 *
 * @namespace com.middlewareops.integrationportal.core.base
 */
export default abstract class BaseController extends Controller {
  private errorHandler: ErrorHandler | undefined;
  /** Cached module bundle, derived from the view name when the view carries no `i18n` model yet. */
  private moduleBundle: ResourceBundle | undefined;

  /**
   * @returns the owning {@link sap.ui.core.UIComponent} of this controller's view.
   */
  public getOwnerComponent(): UIComponent {
    return super.getOwnerComponent() as UIComponent;
  }

  /**
   * @returns the router for the owning component, or its parent component if this is a nested component.
   */
  protected getRouter(): Router {
    const router = UIComponent.getRouterFor(this);
    if (router) {
      return router;
    }

    // For nested components (e.g. modules loaded via Component targets) that do not define their own router
    const parentComponent = Component.getOwnerComponentFor(this.getOwnerComponent());
    if (parentComponent instanceof UIComponent) {
      return parentComponent.getRouter();
    }

    throw new Error("Could not find a Router for this controller");
  }

  /**
   * @param name model name, or omitted for the default (unnamed) model.
   * @returns the requested model from the view.
   */
  protected getModel(name?: string): Model | undefined {
    return this.getView()?.getModel(name);
  }

  /**
   * Sets a model on the view.
   * @param model the model instance.
   * @param name optional model name.
   * @returns this controller, for chaining.
   */
  protected setModel(model: Model, name?: string): this {
    this.getView()?.setModel(model, name);
    return this;
  }

  /**
   * Resolves an i18n text from this screen's resource bundle. Prefers the view-scoped `i18n` model
   * (set per module by the root component on navigation, or propagated from a module component);
   * falls back to a bundle derived from the view name, then to the root component's shell bundle.
   * @param key the i18n key.
   * @param args optional placeholder arguments.
   * @returns the resolved, formatted string.
   */
  protected getText(key: string, args?: (string | number)[]): string {
    return this.resolveBundle().getText(key, args) ?? key;
  }

  /** Resolves the i18n {@link ResourceBundle} backing {@link getText} (see its doc for the order). */
  private resolveBundle(): ResourceBundle {
    const viewModel = this.getView()?.getModel("i18n") as ResourceModel | undefined;
    if (viewModel !== undefined) {
      return viewModel.getResourceBundle() as ResourceBundle;
    }
    this.moduleBundle ??= this.deriveModuleBundle();
    if (this.moduleBundle !== undefined) {
      return this.moduleBundle;
    }
    const componentModel = this.getOwnerComponent().getModel("i18n") as ResourceModel;
    return componentModel.getResourceBundle() as ResourceBundle;
  }

  /**
   * Derives this controller's module bundle from its view name (`…view.<module>.<Name>`) when no
   * `i18n` model is on the view yet (e.g. `getText` called during `onInit`, before route-matched).
   * @returns the module's bundle, or `undefined` for shell/root views with no module segment.
   */
  private deriveModuleBundle(): ResourceBundle | undefined {
    const viewName = (
      this.getView() as { getViewName?: () => string } | undefined
    )?.getViewName?.();
    const match = viewName !== undefined ? /\.view\.([^.]+)\./.exec(viewName) : null;
    if (match === null || match[1] === undefined) {
      return undefined;
    }
    const model = new ResourceModel({
      bundleName: `com.middlewareops.integrationportal.i18n.${match[1]}.i18n`,
      supportedLocales: [""],
      fallbackLocale: "",
    });
    return model.getResourceBundle() as ResourceBundle;
  }

  /**
   * @returns the shared error handler, lazily obtained from the owning component.
   */
  protected getErrorHandler(): ErrorHandler {
    this.errorHandler ??= new ErrorHandler();
    return this.errorHandler;
  }

  /**
   * Navigates to a named route.
   * @param route the target route name.
   * @param parameters optional route parameters.
   */
  protected navTo(route: string, parameters?: Record<string, string>): void {
    this.getRouter().navTo(route, parameters);
  }

  /**
   * Navigates back in history, falling back to the dashboard route when there is no history entry
   * (e.g. the app was opened via a deep link).
   */
  protected onNavBack(): void {
    const previousHash = History.getInstance().getPreviousHash();
    if (previousHash !== undefined) {
      window.history.back();
    } else {
      this.getRouter().navTo(RouteNames.Dashboard, undefined, true);
    }
  }
}
