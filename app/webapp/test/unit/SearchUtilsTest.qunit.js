/**
 * Unit tests for the SearchUtils utility.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/core/utils/SearchUtils",
], function (SearchUtils) {
  "use strict";

  QUnit.module("core/utils/SearchUtils");

  var rows = [
    { flow: "Order To Cash", status: "FAILED" },
    { flow: "Invoice Sync", status: "COMPLETED" },
    { flow: "Café Orders", status: "FAILED" },
  ];

  QUnit.test("empty query matches everything", function (assert) {
    assert.strictEqual(SearchUtils.filter(rows, "", ["flow", "status"]).length, 3);
  });

  QUnit.test("all tokens must match (AND semantics)", function (assert) {
    var hits = SearchUtils.filter(rows, "order failed", ["flow", "status"]);
    assert.strictEqual(hits.length, 2);
  });

  QUnit.test("matching is case- and diacritic-insensitive", function (assert) {
    var hits = SearchUtils.filter(rows, "CAFE", ["flow"]);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].flow, "Café Orders");
  });

  QUnit.test("non-matching query yields no rows", function (assert) {
    assert.strictEqual(SearchUtils.filter(rows, "nonexistent", ["flow", "status"]).length, 0);
  });
});
