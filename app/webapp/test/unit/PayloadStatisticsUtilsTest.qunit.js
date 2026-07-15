/**
 * Unit tests for PayloadStatisticsUtils — Payload Studio's structural statistics (§ Payload Statistics).
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/service/payloadStudio/PayloadStatisticsUtils"],
  function (PayloadStatisticsUtils) {
    "use strict";

    QUnit.module("modules/payloadStudio/service/PayloadStatisticsUtils");

    QUnit.test("computes element/attribute counts for XML", function (assert) {
      var xml = '<Order id="1"><Id>4500001234</Id><Status>OK</Status></Order>';
      var stats = PayloadStatisticsUtils.compute(xml, "xml", undefined);
      assert.strictEqual(stats.elementCount, 3);
      assert.strictEqual(stats.attributeCount, 1);
      assert.strictEqual(stats.arrayCount, undefined);
      assert.strictEqual(stats.objectCount, undefined);
      assert.ok(stats.sizeBytes > 0);
      assert.ok(stats.lineCount >= 1);
      assert.strictEqual(stats.characterCount, xml.length);
    });

    QUnit.test("computes array/object counts for JSON", function (assert) {
      var tree = { id: 1, items: [{ x: 1 }, { y: 2 }], tags: ["a", "b", "c"] };
      var raw = JSON.stringify(tree);
      var stats = PayloadStatisticsUtils.compute(raw, "json", tree);
      assert.strictEqual(stats.objectCount, 3); // root + two items
      assert.strictEqual(stats.arrayCount, 2); // items + tags
      assert.strictEqual(stats.elementCount, undefined);
      assert.strictEqual(stats.attributeCount, undefined);
    });

    QUnit.test("text/binary formats report only size/line/character counts", function (assert) {
      var stats = PayloadStatisticsUtils.compute("hello\nworld", "text", undefined);
      assert.strictEqual(stats.nodeCount, undefined);
      assert.strictEqual(stats.lineCount, 2);
      assert.strictEqual(stats.characterCount, 11);
    });

    QUnit.test(
      "malformed XML yields zero structural counts rather than throwing",
      function (assert) {
        var stats = PayloadStatisticsUtils.compute("<not><valid", "xml", undefined);
        assert.strictEqual(stats.elementCount, 0);
        assert.strictEqual(stats.attributeCount, 0);
      },
    );
  },
);
