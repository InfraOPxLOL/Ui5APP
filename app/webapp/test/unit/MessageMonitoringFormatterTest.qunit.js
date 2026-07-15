/**
 * Unit tests for the Message Investigation Workspace formatter — the health/severity/retry-status
 * mappings the grid, context panel and detail drawer bind through.
 */
sap.ui.define(
  [
    "com/middlewareops/integrationportal/formatter/messageMonitoring/MessageMonitoringFormatter",
  ],
  function (MessageMonitoringFormatter) {
    "use strict";

    QUnit.module("modules/messageMonitoring/formatter/MessageMonitoringFormatter");

    QUnit.test(
      "healthState/severityState delegate to the shared HealthFormatter mapping",
      function (assert) {
        assert.strictEqual(MessageMonitoringFormatter.healthState("healthy"), "Success");
        assert.strictEqual(MessageMonitoringFormatter.healthState("critical"), "Error");
        assert.strictEqual(MessageMonitoringFormatter.severityState("error"), "Error");
        assert.strictEqual(MessageMonitoringFormatter.severityState("info"), "Information");
      },
    );

    QUnit.test("healthIcon/severityIcon return representative icons", function (assert) {
      assert.strictEqual(MessageMonitoringFormatter.healthIcon("critical"), "sap-icon://error");
      assert.strictEqual(
        MessageMonitoringFormatter.severityIcon("critical"),
        "sap-icon://message-error",
      );
    });

    QUnit.test("messageState maps MPL statuses to value states", function (assert) {
      assert.strictEqual(MessageMonitoringFormatter.messageState("COMPLETED"), "Success");
      assert.strictEqual(MessageMonitoringFormatter.messageState("FAILED"), "Error");
      assert.strictEqual(MessageMonitoringFormatter.messageState("PROCESSING"), "Information");
    });

    QUnit.test("retryStatusState maps retry classifications to value states", function (assert) {
      assert.strictEqual(MessageMonitoringFormatter.retryStatusState("retryable"), "Warning");
      assert.strictEqual(MessageMonitoringFormatter.retryStatusState("escalated"), "Error");
      assert.strictEqual(MessageMonitoringFormatter.retryStatusState("not-applicable"), "None");
    });

    QUnit.test(
      "resolveKey resolves a non-empty key via the given resource bundle",
      function (assert) {
        var bundle = {
          getText: function (key) {
            return "resolved:" + key;
          },
        };
        assert.strictEqual(
          MessageMonitoringFormatter.resolveKey("some.key", bundle),
          "resolved:some.key",
        );
        assert.strictEqual(MessageMonitoringFormatter.resolveKey(undefined, bundle), "");
        assert.strictEqual(MessageMonitoringFormatter.resolveKey("", bundle), "");
      },
    );

    QUnit.test(
      "duration/size/dateTime delegate to the centralized formatter library",
      function (assert) {
        assert.strictEqual(MessageMonitoringFormatter.duration(250), "250ms");
        assert.strictEqual(MessageMonitoringFormatter.size(0), "0 B");
        assert.strictEqual(MessageMonitoringFormatter.dateTime(null), "");
      },
    );
  },
);
