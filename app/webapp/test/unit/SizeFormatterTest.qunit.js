/**
 * Unit tests for the centralized SizeFormatter.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/core/formatters/SizeFormatter",
], function (SizeFormatter) {
  "use strict";

  QUnit.module("core/formatters/SizeFormatter");

  QUnit.test("formats zero bytes", function (assert) {
    assert.strictEqual(SizeFormatter.formatBytes(0), "0 B");
  });

  QUnit.test("formats kilobytes and megabytes with one decimal", function (assert) {
    assert.strictEqual(SizeFormatter.formatBytes(1536), "1.5 KB");
    assert.strictEqual(SizeFormatter.formatBytes(1572864), "1.5 MB");
  });

  QUnit.test("returns an empty string for nullish or negative input", function (assert) {
    assert.strictEqual(SizeFormatter.formatBytes(null), "");
    assert.strictEqual(SizeFormatter.formatBytes(-10), "");
  });
});
