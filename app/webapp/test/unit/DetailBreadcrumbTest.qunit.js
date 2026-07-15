/**
 * Unit tests for the Message Monitoring detail page's pure breadcrumb transformations (§ JMS Retry
 * / Expand) — appending/removing the 4th, message-level segment on top of Shell's own
 * Home ▸ Workspace ▸ Module trail.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/controller/messageMonitoring/DetailBreadcrumb"],
  function (DetailBreadcrumb) {
    "use strict";

    QUnit.module("modules/messageMonitoring/controller/DetailBreadcrumb");

    var BASE_CRUMBS = [
      { text: "Home", route: "home" },
      { text: "Operations", route: "dashboard" },
      { text: "Message Monitoring", route: "" },
    ];

    QUnit.test("appendDetailCrumb adds a 4th segment and makes the module crumb clickable", function (assert) {
      var result = DetailBreadcrumb.appendDetailCrumb(BASE_CRUMBS, "MSG-1");
      assert.strictEqual(result.length, 4);
      assert.deepEqual(result[2], { text: "Message Monitoring", route: "messageMonitoring" });
      assert.deepEqual(result[3], { text: "MSG-1", route: "" });
      // Original array is untouched (pure function).
      assert.strictEqual(BASE_CRUMBS.length, 3);
      assert.strictEqual(BASE_CRUMBS[2].route, "");
    });

    QUnit.test("appendDetailCrumb replaces rather than duplicates when called again for the same message", function (assert) {
      var once = DetailBreadcrumb.appendDetailCrumb(BASE_CRUMBS, "MSG-1");
      var twice = DetailBreadcrumb.appendDetailCrumb(once, "MSG-1");
      assert.strictEqual(twice.length, 4);
      assert.strictEqual(twice[3].text, "MSG-1");
    });

    QUnit.test("appendDetailCrumb swaps the trailing segment when navigating to a different message", function (assert) {
      var first = DetailBreadcrumb.appendDetailCrumb(BASE_CRUMBS, "MSG-1");
      var second = DetailBreadcrumb.appendDetailCrumb(first, "MSG-2");
      assert.strictEqual(second.length, 4);
      assert.strictEqual(second[3].text, "MSG-2");
    });

    QUnit.test("removeDetailCrumb restores the base 3-segment trail and its non-clickable module crumb", function (assert) {
      var withDetail = DetailBreadcrumb.appendDetailCrumb(BASE_CRUMBS, "MSG-1");
      var restored = DetailBreadcrumb.removeDetailCrumb(withDetail);
      assert.notStrictEqual(restored, undefined);
      assert.deepEqual(restored, BASE_CRUMBS);
    });

    QUnit.test("removeDetailCrumb is a defensive no-op when there is no 4th segment to remove", function (assert) {
      assert.strictEqual(DetailBreadcrumb.removeDetailCrumb(BASE_CRUMBS), undefined);
      assert.strictEqual(DetailBreadcrumb.removeDetailCrumb([]), undefined);
    });
  },
);
