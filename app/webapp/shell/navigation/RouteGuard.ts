import NavigationService from "./NavigationService";
import UserContext from "../context/UserContext";
import ClientLogger, { type CategoryLogger } from "../../core/logging/ClientLogger";
import type PermissionEngine from "../permissions/PermissionEngine";
import type Router from "sap/ui/core/routing/Router";
import type Route from "sap/ui/core/routing/Route";

/** The slice of {@link UserContext} the guard needs: the live permission engine. */
export interface PermissionSource {
  getPermissionEngine(): PermissionEngine;
}

/**
 * Guards module routes against the current user's permissions (§12).
 *
 * Module routes are declared statically in `manifest.json` (frozen), so the guard cannot literally
 * "not register" them; instead it makes an unauthorized route *unreachable* — navigating to it
 * immediately redirects to the landing page — while the {@link NavigationService} already hides the
 * module from the sidebar, landing cards and global search. Together these satisfy the intent of
 * §12; the **backend remains the final authority** on every request regardless of what the client
 * allows.
 *
 * Non-module routes (home, workspace shells) are never blocked. The guard is UI-only and holds no
 * business logic.
 */
export default class RouteGuard {
  private readonly logger: CategoryLogger = ClientLogger.getLogger("shell.routeGuard");

  /**
   * @param navigation the navigation service resolving module authorization.
   * @param context the user context supplying the live permission engine.
   */
  public constructor(
    private readonly navigation: NavigationService = NavigationService.getInstance(),
    private readonly context: PermissionSource = UserContext.getInstance(),
  ) {}

  /**
   * @param route the route name.
   * @returns whether the route may activate for the current user. Unknown/non-module routes are
   * always allowed; a module route is allowed only when the module is authorized (enabled +
   * permitted).
   */
  public canActivate(route: string): boolean {
    const module = this.navigation.findModuleByRoute(route);
    if (module === undefined) {
      return true;
    }
    return this.navigation.isModuleAuthorized(module, this.context.getPermissionEngine());
  }

  /**
   * Installs the guard on a router: whenever a matched route is not activatable for the current
   * user, {@link onDenied} is invoked (typically to redirect to home and inform the user).
   * @param router the shell router.
   * @param onDenied callback invoked with the denied route name.
   */
  public install(router: Router, onDenied: (route: string) => void): void {
    router.attachRouteMatched((event) => {
      const route = event.getParameter("name" as never) as unknown as string;
      if (!this.canActivate(route)) {
        this.logger.warn(`Blocked navigation to unauthorized route "${route}"`);
        onDenied(route);
      }
    });
  }

  /**
   * Installs a fallback for patterns that match no declared route, redirecting to home. Kept
   * separate so callers can opt in.
   * @param router the shell router.
   * @param onBypassed callback invoked when no route matched.
   */
  public installBypassed(router: Router, onBypassed: () => void): void {
    router.attachBypassed(() => onBypassed());
  }

  /**
   * @param router the shell router.
   * @param route the route name to look up.
   * @returns the route object, or `undefined` when it is not declared.
   */
  public getRoute(router: Router, route: string): Route | undefined {
    return router.getRoute(route) ?? undefined;
  }
}
