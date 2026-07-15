/**
 * Unit tests for the RouteGuard (§12, §19). Uses an injected NavigationService and a fake
 * permission source, so no router or live session is required to test the activation decision.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/navigation/RouteGuard",
  "com/middlewareops/integrationportal/shell/navigation/NavigationService",
  "com/middlewareops/integrationportal/shell/registry/WorkspaceRegistry",
  "com/middlewareops/integrationportal/shell/permissions/PermissionEngine",
], function (RouteGuard, NavigationService, WorkspaceRegistry, PermissionEngine) {
  "use strict";

  var ALL_SCOPES = [
    "Viewer",
    "Operator",
    "Administrator",
    "MessageReplay.Execute",
    "JmsQueue.Purge",
    "Administration.Manage",
  ];

  function guardFor(scopes) {
    WorkspaceRegistry.getInstance().reset();
    var navigation = new NavigationService(WorkspaceRegistry.getInstance(), {
      isModuleEnabled: function () {
        return true;
      },
      isFeatureEnabled: function () {
        return true;
      },
    });
    var engine = new PermissionEngine({ scopes: scopes });
    return new RouteGuard(navigation, {
      getPermissionEngine: function () {
        return engine;
      },
    });
  }

  QUnit.module("shell/navigation/RouteGuard");

  QUnit.test("non-module routes are always activatable", function (assert) {
    assert.strictEqual(guardFor(["Viewer"]).canActivate("home"), true);
    assert.strictEqual(guardFor(["Viewer"]).canActivate("unknownRoute"), true);
  });

  QUnit.test("open module routes activate for a viewer", function (assert) {
    assert.strictEqual(guardFor(["Viewer"]).canActivate("dashboard"), true);
  });

  QUnit.test("permission-gated routes are blocked without the scope", function (assert) {
    var viewer = guardFor(["Viewer"]);
    assert.strictEqual(viewer.canActivate("messageReplay"), false, "needs MessageReplay.Execute");
    assert.strictEqual(viewer.canActivate("administration"), false, "needs Administration.Manage");
  });

  QUnit.test("an admin can activate every route", function (assert) {
    var admin = guardFor(ALL_SCOPES);
    assert.strictEqual(admin.canActivate("messageReplay"), true);
    assert.strictEqual(admin.canActivate("administration"), true);
  });
});
