/**
 * Unit tests for the dynamic NavigationService (§8, §12, §19): visibility resolved from config
 * enablement, feature flags and permissions. A fake enablement source and a permission engine are
 * injected so no live configuration/session is needed.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/navigation/NavigationService",
  "com/middlewareops/integrationportal/shell/registry/WorkspaceRegistry",
  "com/middlewareops/integrationportal/shell/permissions/PermissionEngine",
], function (NavigationService, WorkspaceRegistry, PermissionEngine) {
  "use strict";

  var ALL_SCOPES = [
    "Viewer",
    "Operator",
    "Administrator",
    "MessageReplay.Execute",
    "JmsQueue.Purge",
    "Administration.Manage",
  ];

  function enableAll() {
    return {
      isModuleEnabled: function () {
        return true;
      },
      isFeatureEnabled: function () {
        return true;
      },
    };
  }

  function nav(enablement) {
    WorkspaceRegistry.getInstance().reset();
    return new NavigationService(WorkspaceRegistry.getInstance(), enablement);
  }

  QUnit.module("shell/navigation/NavigationService");

  QUnit.test("admin sees every workspace; viewer cannot see administration", function (assert) {
    var service = nav(enableAll());
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var totalWorkspaces = WorkspaceRegistry.getInstance().getWorkspaces().length;
    var adminCount = service.getVisibleWorkspaces(admin).length;
    assert.strictEqual(adminCount, totalWorkspaces, "admin sees every workspace");
    var viewerWorkspaces = service.getVisibleWorkspaces(viewer).map(function (w) {
      return w.id;
    });
    assert.ok(viewerWorkspaces.indexOf("administration") < 0, "viewer: no administration");
    assert.strictEqual(
      viewerWorkspaces.length,
      adminCount - 1,
      "viewer sees every workspace except the administration-gated one",
    );
  });

  QUnit.test("permission-gated modules are hidden from the sidebar", function (assert) {
    var service = nav(enableAll());
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var retry = service.getVisibleModules("retryCenter", viewer).map(function (m) {
      return m.id;
    });
    assert.deepEqual(retry, ["jmsQueue"], "messageReplay hidden (needs MessageReplay.Execute)");

    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    assert.strictEqual(
      service.getVisibleModules("retryCenter", admin).length,
      2,
      "admin sees both retry modules",
    );
  });

  QUnit.test("a disabled module is hidden even for an admin", function (assert) {
    var service = nav({
      isModuleEnabled: function (id) {
        return id !== "dashboard";
      },
      isFeatureEnabled: function () {
        return true;
      },
    });
    var admin = new PermissionEngine({ scopes: ALL_SCOPES });
    var ops = service.getVisibleModules("operations", admin).map(function (m) {
      return m.id;
    });
    assert.ok(ops.indexOf("dashboard") < 0, "disabled dashboard hidden");
    assert.ok(ops.indexOf("messageMonitoring") >= 0, "other modules still visible");
  });

  QUnit.test("landing workspaces require an authorized module", function (assert) {
    var service = nav(enableAll());
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var landing = service.getLandingWorkspaces(viewer).map(function (w) {
      return w.id;
    });
    assert.ok(landing.indexOf("operations") >= 0);
    assert.ok(landing.indexOf("administration") < 0, "administration not on landing for viewer");
  });

  QUnit.test("findModuleByRoute maps routes to modules", function (assert) {
    var service = nav(enableAll());
    assert.strictEqual(service.findModuleByRoute("dashboard").id, "dashboard");
    assert.strictEqual(service.findModuleByRoute("home"), undefined, "non-module route");
  });
});
