/**
 * Unit tests for the FavoritesService (§15, §19): favorite toggles, pinned actions and capped,
 * de-duplicated most-recently-used lists. Uses unique ids so the session-scoped singleton state
 * cannot collide with other tests on the page.
 */
sap.ui.define([
  "com/middlewareops/integrationportal/shell/favorites/FavoritesService",
], function (FavoritesService) {
  "use strict";

  QUnit.module("shell/favorites/FavoritesService");

  QUnit.test("favorite workspace toggles on and off", function (assert) {
    var service = FavoritesService.getInstance();
    assert.strictEqual(service.toggleFavoriteWorkspace("fw-x"), true, "toggled on");
    assert.strictEqual(service.isFavoriteWorkspace("fw-x"), true);
    assert.strictEqual(service.toggleFavoriteWorkspace("fw-x"), false, "toggled off");
    assert.strictEqual(service.isFavoriteWorkspace("fw-x"), false);
  });

  QUnit.test("favorite module and pinned action toggles are independent", function (assert) {
    var service = FavoritesService.getInstance();
    service.toggleFavoriteModule("fm-x");
    service.togglePinnedAction("pa-x");
    assert.strictEqual(service.isFavoriteModule("fm-x"), true);
    assert.strictEqual(service.isPinnedAction("pa-x"), true);
    assert.strictEqual(service.isFavoriteWorkspace("fm-x"), false, "namespaces do not bleed");
    service.toggleFavoriteModule("fm-x");
    service.togglePinnedAction("pa-x");
  });

  QUnit.test("recent workspaces are newest-first and de-duplicated", function (assert) {
    var service = FavoritesService.getInstance();
    service.recordRecentWorkspace("rec-a");
    service.recordRecentWorkspace("rec-b");
    service.recordRecentWorkspace("rec-a");
    var recents = service.getSnapshot().recentWorkspaces;
    assert.strictEqual(recents[0], "rec-a", "most recent first");
    assert.strictEqual(
      recents.filter(function (id) {
        return id === "rec-a";
      }).length,
      1,
      "de-duplicated",
    );
  });

  QUnit.test("recent lists are capped at six", function (assert) {
    var service = FavoritesService.getInstance();
    ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].forEach(function (id) {
      service.recordRecentWorkspace(id);
    });
    var recents = service.getSnapshot().recentWorkspaces;
    assert.ok(recents.length <= 6, "capped at six");
    assert.ok(recents.indexOf("c8") >= 0, "newest retained");
    assert.ok(recents.indexOf("c1") < 0, "oldest evicted");
  });
});
