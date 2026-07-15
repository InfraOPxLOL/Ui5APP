/**
 * Unit tests for the QuickActionRegistry (§16, §19): ordering, permission filtering and runtime
 * registration.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/actions/QuickActionRegistry",
  "com/middlewareops/integrationportal/shell/permissions/PermissionEngine",
], function (QuickActionRegistry, PermissionEngine) {
  "use strict";

  var ALL_SCOPES = [
    "Viewer",
    "Operator",
    "Administrator",
    "MessageReplay.Execute",
    "JmsQueue.Purge",
    "Administration.Manage",
  ];

  QUnit.module("shell/actions/QuickActionRegistry", {
    beforeEach: function () {
      QuickActionRegistry.getInstance().reset();
    },
  });

  QUnit.test("default actions are returned ordered", function (assert) {
    var actions = QuickActionRegistry.getInstance().getActions();
    assert.strictEqual(actions.length, 5, "five default actions");
    assert.strictEqual(actions[0].id, "openOperations", "lowest order first");
    for (var i = 1; i < actions.length; i++) {
      assert.ok(actions[i].order >= actions[i - 1].order, "ascending order");
    }
  });

  QUnit.test("authorized actions are permission-filtered", function (assert) {
    var registry = QuickActionRegistry.getInstance();
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var viewerIds = registry.getAuthorizedActions(viewer).map(function (a) {
      return a.id;
    });
    assert.ok(viewerIds.indexOf("openAdministration") < 0, "viewer cannot see administration");
    assert.ok(viewerIds.indexOf("openOperations") >= 0, "viewer sees operations");
    var adminIds = registry.getAuthorizedActions(admin).map(function (a) {
      return a.id;
    });
    assert.ok(adminIds.indexOf("openAdministration") >= 0, "admin sees administration");
  });

  QUnit.test("runtime registration and reset", function (assert) {
    var registry = QuickActionRegistry.getInstance();
    registry.register({
      id: "custom",
      titleKey: "x",
      icon: "sap-icon://add",
      order: 1,
      kind: "navigate",
      route: "dashboard",
    });
    assert.strictEqual(registry.getActions()[0].id, "custom", "custom action ordered first");
    registry.reset();
    assert.strictEqual(registry.getActions().length, 5, "reset restores defaults");
  });
});
