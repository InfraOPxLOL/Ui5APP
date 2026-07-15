/**
 * Unit tests for the Operations Workspace formatter — the pure health/severity/timeline/time
 * mappings every widget, timeline row and interface card binds through.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/dashboard/OperationsFormatter"],
  function (OperationsFormatter) {
    "use strict";

    QUnit.module("formatter/dashboard/OperationsFormatter");

    QUnit.test("healthState maps health to UI5 value states", function (assert) {
      assert.strictEqual(OperationsFormatter.healthState("healthy"), "Success");
      assert.strictEqual(OperationsFormatter.healthState("warning"), "Warning");
      assert.strictEqual(OperationsFormatter.healthState("critical"), "Error");
      assert.strictEqual(OperationsFormatter.healthState("unknown"), "None");
    });

    QUnit.test("severityState maps severity to UI5 value states", function (assert) {
      assert.strictEqual(OperationsFormatter.severityState("critical"), "Error");
      assert.strictEqual(OperationsFormatter.severityState("error"), "Error");
      assert.strictEqual(OperationsFormatter.severityState("warning"), "Warning");
      assert.strictEqual(OperationsFormatter.severityState("info"), "Information");
    });

    QUnit.test("healthIcon and timelineIcon return distinct icons per kind", function (assert) {
      assert.strictEqual(OperationsFormatter.healthIcon("critical"), "sap-icon://error");
      assert.strictEqual(OperationsFormatter.timelineIcon("failure"), "sap-icon://error");
      assert.strictEqual(OperationsFormatter.timelineIcon("recovery"), "sap-icon://sys-enter-2");
      assert.strictEqual(
        OperationsFormatter.timelineIcon("deployment"),
        "sap-icon://upload-to-cloud",
      );
    });

    QUnit.test("percent computes and clamps to 0-100", function (assert) {
      assert.strictEqual(OperationsFormatter.percent(1, 4), 25);
      assert.strictEqual(OperationsFormatter.percent(5, 0), 0);
      assert.strictEqual(OperationsFormatter.percent(10, 5), 100);
      assert.strictEqual(OperationsFormatter.percent(-1, 5), 0);
    });

    QUnit.test("relativeTime renders compact relative strings", function (assert) {
      assert.strictEqual(OperationsFormatter.relativeTime(""), "");
      assert.strictEqual(OperationsFormatter.relativeTime("not-a-date"), "");
      assert.strictEqual(
        OperationsFormatter.relativeTime(new Date(Date.now() - 30 * 1000).toISOString()),
        "just now",
      );
      assert.strictEqual(
        OperationsFormatter.relativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString()),
        "5m ago",
      );
      assert.strictEqual(
        OperationsFormatter.relativeTime(new Date(Date.now() - 2 * 3600 * 1000).toISOString()),
        "2h ago",
      );
      assert.strictEqual(
        OperationsFormatter.relativeTime(new Date(Date.now() - 3 * 86400 * 1000).toISOString()),
        "3d ago",
      );
    });

    QUnit.test("severityIndication maps to indication colour names", function (assert) {
      assert.strictEqual(OperationsFormatter.severityIndication("critical"), "Error");
      assert.strictEqual(OperationsFormatter.severityIndication("warning"), "Warning");
      assert.strictEqual(OperationsFormatter.severityIndication("info"), "Information");
    });

    QUnit.test("hasItems reflects positive counts", function (assert) {
      assert.strictEqual(OperationsFormatter.hasItems(0), false);
      assert.strictEqual(OperationsFormatter.hasItems(3), true);
    });
  },
);
