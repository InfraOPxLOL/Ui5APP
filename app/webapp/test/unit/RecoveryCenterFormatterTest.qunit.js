/**
 * Unit tests for the Recovery Center formatter — readiness/consumer/growth-trend/status mappings the
 * Dashboard, Queue Explorer, Candidates, Queue Health, History and Preview surfaces bind through.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/recoveryCenter/RecoveryCenterFormatter"],
  function (RecoveryCenterFormatter) {
    "use strict";

    QUnit.module("modules/recoveryCenter/formatter/RecoveryCenterFormatter");

    QUnit.test(
      "readinessState/readinessIcon map readiness to value states and icons",
      function (assert) {
        assert.strictEqual(RecoveryCenterFormatter.readinessState("ready"), "Success");
        assert.strictEqual(RecoveryCenterFormatter.readinessState("blocked"), "Error");
        assert.strictEqual(RecoveryCenterFormatter.readinessState("unknown"), "None");
        assert.strictEqual(
          RecoveryCenterFormatter.readinessIcon("ready"),
          "sap-icon://sys-enter-2",
        );
        assert.strictEqual(RecoveryCenterFormatter.readinessIcon("blocked"), "sap-icon://error");
      },
    );

    QUnit.test("consumerState maps active/inactive to value states", function (assert) {
      assert.strictEqual(RecoveryCenterFormatter.consumerState("active"), "Success");
      assert.strictEqual(RecoveryCenterFormatter.consumerState("inactive"), "Warning");
    });

    QUnit.test(
      "growthTrendIcon/growthTrendState flag a growing backlog as a warning",
      function (assert) {
        assert.strictEqual(
          RecoveryCenterFormatter.growthTrendIcon("growing"),
          "sap-icon://trend-up",
        );
        assert.strictEqual(
          RecoveryCenterFormatter.growthTrendIcon("shrinking"),
          "sap-icon://trend-down",
        );
        assert.strictEqual(RecoveryCenterFormatter.growthTrendState("growing"), "Warning");
        assert.strictEqual(RecoveryCenterFormatter.growthTrendState("stable"), "None");
      },
    );

    QUnit.test(
      "healthScoreState buckets a 0-100 score into Success/Warning/Error",
      function (assert) {
        assert.strictEqual(RecoveryCenterFormatter.healthScoreState(90), "Success");
        assert.strictEqual(RecoveryCenterFormatter.healthScoreState(50), "Warning");
        assert.strictEqual(RecoveryCenterFormatter.healthScoreState(10), "Error");
      },
    );

    QUnit.test(
      "recoveryStatusState/recoveryStatusIcon map every recovery status",
      function (assert) {
        assert.strictEqual(RecoveryCenterFormatter.recoveryStatusState("completed"), "Success");
        assert.strictEqual(RecoveryCenterFormatter.recoveryStatusState("failed"), "Error");
        assert.strictEqual(RecoveryCenterFormatter.recoveryStatusState("cancelled"), "Warning");
        assert.strictEqual(RecoveryCenterFormatter.recoveryStatusState("running"), "Information");
        assert.strictEqual(
          RecoveryCenterFormatter.recoveryStatusIcon("completed"),
          "sap-icon://sys-enter-2",
        );
      },
    );

    QUnit.test("checkState/checkIcon map a validation check's pass/fail", function (assert) {
      assert.strictEqual(RecoveryCenterFormatter.checkState(true), "Success");
      assert.strictEqual(RecoveryCenterFormatter.checkState(false), "Error");
      assert.strictEqual(RecoveryCenterFormatter.checkIcon(true), "sap-icon://sys-enter-2");
    });

    QUnit.test("messageAge renders a dash for an undefined age", function (assert) {
      assert.strictEqual(RecoveryCenterFormatter.messageAge(undefined), "—");
      assert.notStrictEqual(RecoveryCenterFormatter.messageAge(60000), "—");
    });

    QUnit.test("hasItems reflects whether a count is greater than zero", function (assert) {
      assert.strictEqual(RecoveryCenterFormatter.hasItems(0), false);
      assert.strictEqual(RecoveryCenterFormatter.hasItems(3), true);
    });
  },
);
