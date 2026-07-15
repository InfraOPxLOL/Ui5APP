/**
 * Unit tests for RecoveryLayoutService (§ Queue Explorer — "Saved layouts"): session-only saved
 * layout CRUD. Uses unique names so the session-scoped singleton state cannot collide with other
 * tests on the page.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/service/recoveryCenter/RecoveryLayoutService"],
  function (RecoveryLayoutService) {
    "use strict";

    QUnit.module("modules/recoveryCenter/service/RecoveryLayoutService");

    QUnit.test("save/get round-trips a named layout snapshot", function (assert) {
      var service = RecoveryLayoutService.getInstance();
      var snapshot = { search: "ORDERS", sortField: "messageCount", sortDescending: true };
      var id = service.save("rls-layout-a", snapshot);
      var saved = service.get(id);
      assert.strictEqual(saved.name, "rls-layout-a");
      assert.deepEqual(saved.snapshot, snapshot);
    });

    QUnit.test("getAll includes every saved layout", function (assert) {
      var service = RecoveryLayoutService.getInstance();
      var id1 = service.save("rls-layout-b1", {
        search: "",
        sortField: "queueName",
        sortDescending: false,
      });
      var id2 = service.save("rls-layout-b2", {
        search: "",
        sortField: "queueName",
        sortDescending: false,
      });
      var ids = service.getAll().map(function (layout) {
        return layout.id;
      });
      assert.ok(ids.indexOf(id1) >= 0);
      assert.ok(ids.indexOf(id2) >= 0);
    });

    QUnit.test("remove deletes a saved layout", function (assert) {
      var service = RecoveryLayoutService.getInstance();
      var id = service.save("rls-layout-c", {
        search: "",
        sortField: "queueName",
        sortDescending: false,
      });
      assert.ok(service.get(id) !== undefined);
      service.remove(id);
      assert.strictEqual(service.get(id), undefined);
    });

    QUnit.test("get returns undefined for an unknown id", function (assert) {
      var service = RecoveryLayoutService.getInstance();
      assert.strictEqual(service.get("does-not-exist"), undefined);
    });
  },
);
