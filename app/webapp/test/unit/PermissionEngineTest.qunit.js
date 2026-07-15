/**
 * Unit tests for the shell PermissionEngine (§6, §7, §19). Scopes and role-collection ids are
 * passed as literals so the test needs no live XSUAA session.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/permissions/PermissionEngine",
], function (PermissionEngine) {
  "use strict";

  QUnit.module("shell/permissions/PermissionEngine");

  QUnit.test("scope checks: has / all / any", function (assert) {
    var engine = new PermissionEngine({ scopes: ["Viewer", "Operator"] });
    assert.strictEqual(engine.hasScope("Viewer"), true);
    assert.strictEqual(engine.hasScope("Administrator"), false);
    assert.strictEqual(engine.hasAllScopes(["Viewer", "Operator"]), true);
    assert.strictEqual(engine.hasAllScopes(["Viewer", "Administrator"]), false);
    assert.strictEqual(engine.hasAnyScope(["Administrator", "Operator"]), true);
    assert.strictEqual(engine.hasAnyScope([]), false);
  });

  QUnit.test("role collections resolve through scope coverage", function (assert) {
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    assert.strictEqual(viewer.hasRoleCollection("IntegrationPortal_Viewer"), true);
    assert.strictEqual(viewer.hasRoleCollection("IntegrationPortal_Administrator"), false);
    assert.strictEqual(viewer.hasRoleCollection("PI_ADMIN"), false);
    assert.strictEqual(viewer.hasRoleCollection("does-not-exist"), false);
  });

  QUnit.test("permission inheritance is followed", function (assert) {
    // Administrator collection inherits Operator which inherits Viewer.
    var admin = new PermissionEngine({
      scopes: [
        "Viewer",
        "Operator",
        "Administrator",
        "MessageReplay.Execute",
        "JmsQueue.Purge",
        "Administration.Manage",
      ],
    });
    assert.strictEqual(admin.hasRoleCollection("IntegrationPortal_Administrator"), true);
    assert.strictEqual(admin.hasRoleCollection("IntegrationPortal_Operator"), true);
    assert.strictEqual(admin.hasRoleCollection("IntegrationPortal_Viewer"), true);
    assert.strictEqual(admin.hasRoleCollection("PI_ADMIN"), true);
  });

  QUnit.test("assigned role collections lists every held collection", function (assert) {
    var viewer = new PermissionEngine({ scopes: ["Viewer"] });
    var assigned = viewer.getAssignedRoleCollections();
    assert.ok(assigned.indexOf("IntegrationPortal_Viewer") >= 0, "viewer collection assigned");
    assert.ok(assigned.indexOf("PI_OPERATIONS_VIEWER") >= 0, "operations viewer assigned");
    assert.ok(
      assigned.indexOf("IntegrationPortal_Administrator") < 0,
      "administrator not assigned to a viewer",
    );
  });

  QUnit.test("isSatisfied evaluates AND/OR requirement semantics", function (assert) {
    // Full Operator scope set so IntegrationPortal_Operator (Operator + MessageReplay.Execute +
    // JmsQueue.Purge, per RoleCollections.ts) is genuinely held by this engine.
    var engine = new PermissionEngine({
      scopes: ["Viewer", "Operator", "MessageReplay.Execute", "JmsQueue.Purge"],
    });
    assert.strictEqual(engine.isSatisfied(undefined), true, "no requirement ⇒ satisfied");
    assert.strictEqual(engine.isSatisfied({ allScopes: ["Viewer"] }), true);
    assert.strictEqual(engine.isSatisfied({ allScopes: ["Administrator"] }), false);
    assert.strictEqual(engine.isSatisfied({ anyScope: ["Administrator", "Operator"] }), true);
    assert.strictEqual(
      engine.isSatisfied({ anyRoleCollection: ["IntegrationPortal_Operator"] }),
      true,
    );
    assert.strictEqual(
      engine.isSatisfied({ allScopes: ["Viewer"], anyScope: ["Administrator"] }),
      false,
      "all AND-combined with any",
    );
  });

  QUnit.test("resolved scopes are returned sorted", function (assert) {
    var engine = new PermissionEngine({ scopes: ["Operator", "Viewer"] });
    assert.deepEqual(engine.getResolvedScopes(), ["Operator", "Viewer"]);
  });

  QUnit.test("future attributes are absent today", function (assert) {
    var engine = new PermissionEngine({ scopes: ["Viewer"] });
    assert.strictEqual(engine.hasAttribute("Region", "EU10"), false);
  });
});
