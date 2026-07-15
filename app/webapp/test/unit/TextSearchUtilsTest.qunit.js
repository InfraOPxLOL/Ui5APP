/**
 * Unit tests for the centralized TextSearchUtils. Serves Payload Studio's in-payload search (§ Search).
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/core/utils/TextSearchUtils"],
  function (TextSearchUtils) {
    "use strict";

    QUnit.module("core/utils/TextSearchUtils");

    QUnit.test(
      "findMatches finds every literal occurrence, case-insensitive by default",
      function (assert) {
        var result = TextSearchUtils.findMatches("Order ORDER order", "order");
        assert.strictEqual(result.count, 3);
        assert.strictEqual(result.matches[0].start, 0);
        assert.strictEqual(result.matches[0].end, 5);
      },
    );

    QUnit.test("caseSensitive restricts matches to the exact case", function (assert) {
      var result = TextSearchUtils.findMatches("Order ORDER order", "order", {
        caseSensitive: true,
      });
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.matches[0].start, 12);
    });

    QUnit.test("wholeWord matches only whole-word occurrences", function (assert) {
      var result = TextSearchUtils.findMatches("cat catalog cat", "cat", { wholeWord: true });
      assert.strictEqual(result.count, 2);
    });

    QUnit.test("regex mode interprets the query as a regular expression", function (assert) {
      var result = TextSearchUtils.findMatches("a1 b2 c3", "[a-z]\\d", { regex: true });
      assert.strictEqual(result.count, 3);
    });

    QUnit.test("an invalid regex yields zero matches rather than throwing", function (assert) {
      var result = TextSearchUtils.findMatches("text", "(unterminated", { regex: true });
      assert.strictEqual(result.count, 0);
    });

    QUnit.test("empty query yields zero matches", function (assert) {
      assert.strictEqual(TextSearchUtils.findMatches("text", "").count, 0);
    });

    QUnit.test("findNext wraps to the first match after the last", function (assert) {
      var matches = [
        { start: 0, end: 1 },
        { start: 5, end: 6 },
        { start: 10, end: 11 },
      ];
      assert.strictEqual(TextSearchUtils.findNext(matches, 10).start, 0);
      assert.strictEqual(TextSearchUtils.findNext(matches, 2).start, 5);
      assert.strictEqual(TextSearchUtils.findNext([], 0), undefined);
    });

    QUnit.test("findPrevious wraps to the last match before the first", function (assert) {
      var matches = [
        { start: 0, end: 1 },
        { start: 5, end: 6 },
        { start: 10, end: 11 },
      ];
      assert.strictEqual(TextSearchUtils.findPrevious(matches, 0).start, 10);
      // Symmetric with findNext: the last match strictly before cursor 6 is the one at start 5.
      assert.strictEqual(TextSearchUtils.findPrevious(matches, 6).start, 5);
    });

    QUnit.test(
      "offsetOfLine resolves a 1-based line number to a character offset",
      function (assert) {
        var text = "line1\nline2\nline3";
        assert.strictEqual(TextSearchUtils.offsetOfLine(text, 1), 0);
        assert.strictEqual(TextSearchUtils.offsetOfLine(text, 2), 6);
        assert.strictEqual(TextSearchUtils.offsetOfLine(text, 3), 12);
      },
    );

    QUnit.test("lineCount counts lines, 0 for empty text", function (assert) {
      assert.strictEqual(TextSearchUtils.lineCount(""), 0);
      assert.strictEqual(TextSearchUtils.lineCount("a\nb\nc"), 3);
    });
  },
);
