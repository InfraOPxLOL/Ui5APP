/**
 * Unit tests for PayloadValidationUtils — Payload Studio's read-only validation (§ Validation).
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/service/payloadStudio/PayloadValidationUtils"],
  function (PayloadValidationUtils) {
    "use strict";

    QUnit.module("modules/payloadStudio/service/PayloadValidationUtils");

    QUnit.test("well-formed XML validates with no issues", function (assert) {
      var result = PayloadValidationUtils.validate("<Order><Id>1</Id></Order>", "xml");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.issues.length, 0);
    });

    QUnit.test("malformed XML reports an error issue", function (assert) {
      var result = PayloadValidationUtils.validate("<Order><Id>1</Order>", "xml");
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.issues.some(function (issue) {
          return issue.severity === "error";
        }),
      );
    });

    QUnit.test("valid JSON validates with no issues", function (assert) {
      var result = PayloadValidationUtils.validate('{"id":1}', "json");
      assert.strictEqual(result.valid, true);
    });

    QUnit.test("invalid JSON reports an error issue", function (assert) {
      var result = PayloadValidationUtils.validate("{id:1}", "json");
      assert.strictEqual(result.valid, false);
    });

    QUnit.test(
      "text payloads are not format-validated (no XML/JSON check applies)",
      function (assert) {
        var result = PayloadValidationUtils.validate("plain text content", "text");
        assert.strictEqual(result.valid, true);
      },
    );

    QUnit.test("control characters are flagged as a warning, not an error", function (assert) {
      var withControlChar = "valid" + String.fromCharCode(1) + "text";
      var result = PayloadValidationUtils.validate(withControlChar, "text");
      assert.strictEqual(result.valid, true);
      assert.ok(
        result.issues.some(function (issue) {
          return issue.severity === "warning";
        }),
      );
    });
  },
);
