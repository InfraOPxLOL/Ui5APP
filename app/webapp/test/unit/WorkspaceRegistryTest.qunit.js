/**
 * Unit tests for the WorkspaceRegistry and its consistency with the frozen core ModuleRegistry
 * (§4, §5, §19).
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/registry/WorkspaceRegistry",
  "com/middlewareops/integrationportal/shell/model/ModuleRegistry",
], function (WorkspaceRegistry, ModuleRegistry) {
  "use strict";

  QUnit.module("shell/registry/WorkspaceRegistry", {
    beforeEach: function () {
      WorkspaceRegistry.getInstance().reset();
    },
  });

  QUnit.test("workspaces are returned ordered by their order field", function (assert) {
    var workspaces = WorkspaceRegistry.getInstance().getWorkspaces();
    assert.ok(workspaces.length > 0, "workspaces are seeded");
    assert.strictEqual(workspaces[0].id, "operations", "operations first");
    for (var i = 1; i < workspaces.length; i++) {
      assert.ok(workspaces[i].order >= workspaces[i - 1].order, "ascending order");
    }
  });

  QUnit.test("getWorkspace returns a definition with member modules", function (assert) {
    var operations = WorkspaceRegistry.getInstance().getWorkspace("operations");
    assert.ok(operations, "workspace resolved");
    assert.ok(operations.moduleIds.indexOf("dashboard") >= 0, "dashboard belongs to operations");
    assert.strictEqual(WorkspaceRegistry.getInstance().getWorkspace("nope"), undefined);
  });

  QUnit.test("modules for a workspace are ordered by navigation order", function (assert) {
    var modules = WorkspaceRegistry.getInstance().getModulesForWorkspace("operations");
    assert.strictEqual(modules[0].id, "dashboard", "dashboard first (order 10)");
    for (var i = 1; i < modules.length; i++) {
      assert.ok(
        modules[i].navigationOrder >= modules[i - 1].navigationOrder,
        "ascending navigation order",
      );
    }
  });

  QUnit.test("every core module has shell metadata (registries in lock-step)", function (assert) {
    var registered = WorkspaceRegistry.getInstance().getRegisteredModules();
    assert.strictEqual(
      registered.length,
      ModuleRegistry.getAll().length,
      "one shell metadata entry per core module",
    );
    registered.forEach(function (module) {
      assert.ok(module.workspace, module.id + " is assigned to a workspace");
      assert.ok(module.route, module.id + " carries a route from the core definition");
    });
  });

  QUnit.test("runtime registration overrides and reset restores defaults", function (assert) {
    var registry = WorkspaceRegistry.getInstance();
    registry.registerWorkspace({
      id: "operations",
      titleKey: "x",
      descriptionKey: "x",
      icon: "sap-icon://home",
      themeAccent: "#000000",
      order: 999,
      showOnLanding: false,
      showInSidebar: false,
      moduleIds: [],
      defaultRoute: "dashboard",
    });
    assert.strictEqual(registry.getWorkspace("operations").order, 999, "override applied");
    registry.reset();
    assert.strictEqual(registry.getWorkspace("operations").order, 10, "reset restores default");
  });
});
