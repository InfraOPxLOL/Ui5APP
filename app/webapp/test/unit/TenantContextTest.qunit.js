/**
 * Unit tests for the TenantContext (§11, §19): tenant switching over the global TenantModel.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/context/TenantContext",
  "com/middlewareops/integrationportal/core/models/TenantModel",
], function (TenantContext, TenantModel) {
  "use strict";

  function tenant(id, enabled, isDefault) {
    return {
      id: id,
      name: id.toUpperCase(),
      description: "",
      region: "eu10",
      environment: "prod",
      enabled: enabled,
      displayColor: "#0070F2",
      displayIcon: "sap-icon://cloud",
      refreshProfile: "default",
      default: isDefault,
    };
  }

  QUnit.module("shell/context/TenantContext", {
    beforeEach: function () {
      this.model = new TenantModel();
      this.model.applyConfig(
        [tenant("t1", true, true), tenant("t2", true, false), tenant("t3", false, false)],
        tenant("t1", true, true),
      );
      TenantContext.getInstance().initialize(this.model);
    },
  });

  QUnit.test("starts on the default tenant", function (assert) {
    assert.strictEqual(TenantContext.getInstance().getCurrentTenantId(), "t1");
    assert.strictEqual(TenantContext.getInstance().getCurrentTenant().id, "t1");
  });

  QUnit.test("only enabled tenants are selectable", function (assert) {
    var ids = TenantContext.getInstance()
      .getSelectableTenants()
      .map(function (t) {
        return t.id;
      });
    assert.deepEqual(ids, ["t1", "t2"], "disabled t3 excluded");
  });

  QUnit.test("switching to another enabled tenant succeeds", function (assert) {
    assert.strictEqual(TenantContext.getInstance().switchTenant("t2"), true);
    assert.strictEqual(TenantContext.getInstance().getCurrentTenantId(), "t2");
  });

  QUnit.test("switching to the same, unknown or disabled tenant is a no-op", function (assert) {
    var context = TenantContext.getInstance();
    assert.strictEqual(context.switchTenant("t1"), false, "same tenant");
    assert.strictEqual(context.switchTenant("nope"), false, "unknown tenant");
    assert.strictEqual(context.switchTenant("t3"), false, "disabled tenant");
    assert.strictEqual(context.getCurrentTenantId(), "t1", "selection unchanged");
  });
});
