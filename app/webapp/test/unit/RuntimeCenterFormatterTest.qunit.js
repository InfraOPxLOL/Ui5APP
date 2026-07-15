/**
 * Unit tests for the Runtime Center formatter — health/failure-trend/deployment-event/severity
 * mappings the Integration Catalog, Integration Details, Runtime Health and Deployment Timeline
 * surfaces bind through.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/runtimeCenter/RuntimeCenterFormatter"],
  function (RuntimeCenterFormatter) {
    "use strict";

    QUnit.module("modules/runtimeCenter/formatter/RuntimeCenterFormatter");

    QUnit.test(
      "healthState/healthIcon delegate to the shared formatter library",
      function (assert) {
        assert.strictEqual(RuntimeCenterFormatter.healthState("healthy"), "Success");
        assert.strictEqual(RuntimeCenterFormatter.healthState("critical"), "Error");
        assert.strictEqual(RuntimeCenterFormatter.healthIcon("healthy"), "sap-icon://sys-enter-2");
      },
    );

    QUnit.test("severityState delegates to the shared formatter library", function (assert) {
      assert.strictEqual(RuntimeCenterFormatter.severityState("error"), "Error");
      assert.strictEqual(RuntimeCenterFormatter.severityState("info"), "Information");
    });

    QUnit.test(
      "healthScoreState buckets a 0-100 score into Success/Warning/Error",
      function (assert) {
        assert.strictEqual(RuntimeCenterFormatter.healthScoreState(90), "Success");
        assert.strictEqual(RuntimeCenterFormatter.healthScoreState(50), "Warning");
        assert.strictEqual(RuntimeCenterFormatter.healthScoreState(10), "Error");
      },
    );

    QUnit.test(
      "failureTrendIcon/failureTrendState flag an increasing trend as a warning",
      function (assert) {
        assert.strictEqual(
          RuntimeCenterFormatter.failureTrendIcon("increasing"),
          "sap-icon://trend-up",
        );
        assert.strictEqual(
          RuntimeCenterFormatter.failureTrendIcon("decreasing"),
          "sap-icon://trend-down",
        );
        assert.strictEqual(RuntimeCenterFormatter.failureTrendState("increasing"), "Warning");
        assert.strictEqual(RuntimeCenterFormatter.failureTrendState("stable"), "None");
      },
    );

    QUnit.test(
      "deploymentEventIcon/deploymentEventState distinguish redeployed from deployed",
      function (assert) {
        assert.strictEqual(
          RuntimeCenterFormatter.deploymentEventIcon("redeployed"),
          "sap-icon://redo",
        );
        assert.strictEqual(
          RuntimeCenterFormatter.deploymentEventIcon("deployed"),
          "sap-icon://shipping-status",
        );
        assert.strictEqual(
          RuntimeCenterFormatter.deploymentEventState("redeployed"),
          "Information",
        );
        assert.strictEqual(RuntimeCenterFormatter.deploymentEventState("deployed"), "None");
      },
    );

    QUnit.test("hasItems reflects whether a count is greater than zero", function (assert) {
      assert.strictEqual(RuntimeCenterFormatter.hasItems(0), false);
      assert.strictEqual(RuntimeCenterFormatter.hasItems(3), true);
    });
  },
);
