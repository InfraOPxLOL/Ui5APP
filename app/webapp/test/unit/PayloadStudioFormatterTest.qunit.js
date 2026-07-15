/**
 * Unit tests for the Payload Studio formatter — retry-status/format/validation/diff mappings the
 * metadata panel, editor and comparison view bind through.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/payloadStudio/PayloadStudioFormatter"],
  function (PayloadStudioFormatter) {
    "use strict";

    QUnit.module("modules/payloadStudio/formatter/PayloadStudioFormatter");

    QUnit.test("retryStatusState maps retry classifications to value states", function (assert) {
      assert.strictEqual(PayloadStudioFormatter.retryStatusState("retryable"), "Warning");
      assert.strictEqual(PayloadStudioFormatter.retryStatusState("escalated"), "Error");
      assert.strictEqual(PayloadStudioFormatter.retryStatusState("not-applicable"), "None");
    });

    QUnit.test("formatIcon returns a representative icon per payload format", function (assert) {
      assert.strictEqual(PayloadStudioFormatter.formatIcon("xml"), "sap-icon://display-more");
      assert.strictEqual(PayloadStudioFormatter.formatIcon("json"), "sap-icon://syntax");
      assert.strictEqual(PayloadStudioFormatter.formatIcon("binary"), "sap-icon://attachment");
    });

    QUnit.test("validationSeverityState maps error/warning to value states", function (assert) {
      assert.strictEqual(PayloadStudioFormatter.validationSeverityState("error"), "Error");
      assert.strictEqual(PayloadStudioFormatter.validationSeverityState("warning"), "Warning");
    });

    QUnit.test("diffLineState maps diff line kinds to indication names", function (assert) {
      assert.strictEqual(PayloadStudioFormatter.diffLineState("added"), "Success");
      assert.strictEqual(PayloadStudioFormatter.diffLineState("removed"), "Error");
      assert.strictEqual(PayloadStudioFormatter.diffLineState("equal"), "None");
    });

    QUnit.test(
      "severityState/size/duration delegate to the centralized formatter library",
      function (assert) {
        assert.strictEqual(PayloadStudioFormatter.severityState("error"), "Error");
        assert.strictEqual(PayloadStudioFormatter.size(0), "0 B");
        assert.strictEqual(PayloadStudioFormatter.duration(250), "250ms");
      },
    );
  },
);
