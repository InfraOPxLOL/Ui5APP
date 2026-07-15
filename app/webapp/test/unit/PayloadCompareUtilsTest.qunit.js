/**
 * Unit tests for PayloadCompareUtils — Payload Studio's request/response comparison (§ Request/Response Comparison).
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/service/payloadStudio/PayloadCompareUtils"],
  function (PayloadCompareUtils) {
    "use strict";

    QUnit.module("modules/payloadStudio/service/PayloadCompareUtils");

    QUnit.test(
      "identical texts produce an all-equal diff with a summary of zero changes",
      function (assert) {
        var result = PayloadCompareUtils.compare("a\nb\nc", "a\nb\nc");
        assert.strictEqual(result.truncated, false);
        assert.strictEqual(result.summary.identical, true);
        assert.strictEqual(result.summary.addedLines, 0);
        assert.strictEqual(result.summary.removedLines, 0);
        assert.ok(
          result.lines.every(function (line) {
            return line.kind === "equal";
          }),
        );
      },
    );

    QUnit.test("detects an added line", function (assert) {
      var result = PayloadCompareUtils.compare("a\nb", "a\nb\nc");
      assert.strictEqual(result.summary.addedLines, 1);
      assert.strictEqual(result.summary.removedLines, 0);
      assert.strictEqual(result.summary.identical, false);
    });

    QUnit.test("detects a removed line", function (assert) {
      var result = PayloadCompareUtils.compare("a\nb\nc", "a\nc");
      assert.strictEqual(result.summary.removedLines, 1);
      assert.strictEqual(result.summary.addedLines, 0);
    });

    QUnit.test("ignoreWhitespace treats differently-spaced lines as equal", function (assert) {
      var withoutOption = PayloadCompareUtils.compare("a   b", "a b");
      assert.strictEqual(withoutOption.summary.identical, false);

      var withOption = PayloadCompareUtils.compare("a   b", "a b", { ignoreWhitespace: true });
      assert.strictEqual(withOption.summary.identical, true);
    });

    QUnit.test("reports truncated for inputs exceeding the line-count bound", function (assert) {
      var huge = new Array(2001).fill("line").join("\n");
      var result = PayloadCompareUtils.compare(huge, huge);
      assert.strictEqual(result.truncated, true);
      assert.deepEqual(result.lines, []);
    });
  },
);
