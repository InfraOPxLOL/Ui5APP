/**
 * Unit tests for the centralized DurationFormatter. Serves as the reference pattern for unit tests
 * of pure core utilities: require the module under test, assert against known inputs/outputs.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/core/formatters/DurationFormatter",
], function (DurationFormatter) {
  "use strict";

  QUnit.module("core/formatters/DurationFormatter");

  QUnit.test("formats sub-second durations as milliseconds", function (assert) {
    assert.strictEqual(DurationFormatter.formatMillis(250), "250ms");
  });

  QUnit.test("formats compound durations", function (assert) {
    assert.strictEqual(DurationFormatter.formatMillis(90000), "1m 30s");
  });

  QUnit.test("returns an empty string for nullish or negative input", function (assert) {
    assert.strictEqual(DurationFormatter.formatMillis(null), "");
    assert.strictEqual(DurationFormatter.formatMillis(-1), "");
  });
});
