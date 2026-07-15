/**
 * Unit tests for the ShellViewBuilder (§2, §9, §19): landing cards, workspace navigation, sidebar,
 * quick actions and breadcrumbs — all resolved against permissions and favorites.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/model/ShellViewBuilder",
  "com/middlewareops/integrationportal/shell/navigation/NavigationService",
  "com/middlewareops/integrationportal/shell/registry/WorkspaceRegistry",
  "com/middlewareops/integrationportal/shell/favorites/FavoritesService",
  "com/middlewareops/integrationportal/shell/actions/QuickActionRegistry",
  "com/middlewareops/integrationportal/shell/permissions/PermissionEngine",
], function (
  ShellViewBuilder,
  NavigationService,
  WorkspaceRegistry,
  FavoritesService,
  QuickActionRegistry,
  PermissionEngine,
) {
  "use strict";

  var ALL_SCOPES = [
    "Viewer",
    "Operator",
    "Administrator",
    "MessageReplay.Execute",
    "JmsQueue.Purge",
    "Administration.Manage",
  ];

  var identity = function (key) {
    return key;
  };

  function builder() {
    WorkspaceRegistry.getInstance().reset();
    QuickActionRegistry.getInstance().reset();
    var registry = WorkspaceRegistry.getInstance();
    var navigation = new NavigationService(registry, {
      isModuleEnabled: function () {
        return true;
      },
      isFeatureEnabled: function () {
        return true;
      },
    });
    return new ShellViewBuilder(
      navigation,
      registry,
      FavoritesService.getInstance(),
      QuickActionRegistry.getInstance(),
    );
  }

  QUnit.module("shell/model/ShellViewBuilder");

  QUnit.test("only authorized landing cards appear", function (assert) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });

    var adminCards = b.buildLandingWorkspaceCards(admin, identity).map(function (c) {
      return c.id;
    });
    var landingWorkspaceCount = WorkspaceRegistry.getInstance()
      .getWorkspaces()
      .filter(function (w) {
        return w.showOnLanding;
      }).length;
    assert.strictEqual(
      adminCards.length,
      landingWorkspaceCount,
      "admin sees a landing card for every landing workspace",
    );

    var viewerCards = b.buildLandingWorkspaceCards(viewer, identity).map(function (c) {
      return c.id;
    });
    assert.ok(viewerCards.indexOf("administration") < 0, "viewer does not see administration card");
  });

  QUnit.test("workspace nav marks the active workspace selected", function (assert) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var nav = b.buildWorkspaceNav(admin, "operations", identity);
    var operations = nav.filter(function (w) {
      return w.id === "operations";
    })[0];
    assert.strictEqual(operations.selected, true, "operations is selected");
  });

  QUnit.test("sidebar lists the active workspace's authorized modules", function (assert) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var ids = b.buildSidebar("operations", admin, identity).map(function (m) {
      return m.moduleId;
    });
    assert.ok(ids.indexOf("dashboard") >= 0, "dashboard present");
  });

  QUnit.test("favorite workspace cards reflect FavoritesService", function (assert) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var favorites = FavoritesService.getInstance();
    favorites.toggleFavoriteWorkspace("analytics");
    var ids = b.buildFavoriteWorkspaceCards(admin, identity).map(function (c) {
      return c.id;
    });
    assert.ok(ids.indexOf("analytics") >= 0, "analytics is a favorite card");
    favorites.toggleFavoriteWorkspace("analytics");
    assert.ok(
      b
        .buildFavoriteWorkspaceCards(admin, identity)
        .map(function (c) {
          return c.id;
        })
        .indexOf("analytics") < 0,
      "un-favoriting removes the card",
    );
  });

  QUnit.test("quick actions are permission-filtered", function (assert) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var adminIds = b.buildQuickActions(admin, identity).map(function (a) {
      return a.id;
    });
    var viewerIds = b.buildQuickActions(viewer, identity).map(function (a) {
      return a.id;
    });
    assert.ok(adminIds.indexOf("openAdministration") >= 0, "admin sees Open Administration");
    assert.ok(viewerIds.indexOf("openAdministration") < 0, "viewer does not");
  });

  QUnit.test("breadcrumbs form Home ▸ Workspace ▸ Module with a passive last crumb", function (
    assert,
  ) {
    var b = builder();
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var crumbs = b.buildBreadcrumbs("operations", "dashboard", identity);
    assert.strictEqual(crumbs.length, 3, "three crumbs");
    assert.strictEqual(crumbs[0].route, "home", "first crumb links home");
    assert.strictEqual(crumbs[2].route, "", "last crumb is passive");
  });
});
