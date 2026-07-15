/**
 * Unit tests for the StringUtils utility.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/core/utils/StringUtils",
], function (StringUtils) {
  "use strict";

  QUnit.module("core/utils/StringUtils");

  QUnit.test("isBlank detects nullish and whitespace-only strings", function (assert) {
    assert.strictEqual(StringUtils.isBlank(null), true);
    assert.strictEqual(StringUtils.isBlank("   "), true);
    assert.strictEqual(StringUtils.isBlank("x"), false);
  });

  QUnit.test("truncate keeps short strings and appends an ellipsis when cutting", function (assert) {
    assert.strictEqual(StringUtils.truncate("short", 10), "short");
    assert.strictEqual(StringUtils.truncate("integration", 6), "integ…");
  });

  QUnit.test("camelToKebab and kebabToCamel round-trip module ids", function (assert) {
    assert.strictEqual(StringUtils.camelToKebab("messageMonitoring"), "message-monitoring");
    assert.strictEqual(StringUtils.kebabToCamel("message-monitoring"), "messageMonitoring");
  });

  QUnit.test("escapeHtml neutralizes markup-significant characters", function (assert) {
    assert.strictEqual(StringUtils.escapeHtml("<b>&\"'</b>"), "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });

  QUnit.test("shortenId keeps both ends of a long id", function (assert) {
    assert.strictEqual(StringUtils.shortenId("ABCDEFGHIJKLMNOP", 4), "ABCD…MNOP");
    assert.strictEqual(StringUtils.shortenId("SHORT", 4), "SHORT");
  });
});
