/**
 * Unit tests for the portal updates (What's new): which changes are new to a user, marking them
 * seen, and filtering the Updates page.
 */
sap.ui.define(
  [
    "com/middlewareops/integrationportal/shell/updates/UpdatesService",
    "com/middlewareops/integrationportal/shell/updates/ReleaseNotes",
  ],
  function (UpdatesService, ReleaseNotes) {
    "use strict";

    QUnit.module("shell/updates/UpdatesService");

    var RELEASES = [
      {
        id: "2026-10-26.2",
        date: "2026-10-26",
        title: "Journey",
        summary: "Where it is",
        items: [
          {
            type: "new",
            area: "operations",
            title: "Journey tab",
            description: "Stages",
            route: "reportServer",
          },
          { type: "improved", area: "platform", title: "Bell", description: "What's new" },
        ],
      },
      {
        id: "2026-10-09",
        date: "2026-10-09",
        title: "Search",
        summary: "Find faster",
        items: [
          { type: "fixed", area: "operations", title: "Retry", description: "Moves the message" },
        ],
      },
    ];

    function memoryStore(initial) {
      var value = initial === undefined ? null : initial;
      return {
        get: function () {
          return value;
        },
        set: function (next) {
          value = next;
        },
      };
    }

    QUnit.test("a first visit shows only the latest release as new", function (assert) {
      var service = new UpdatesService(RELEASES, memoryStore());
      assert.strictEqual(service.unseenCount(), 2);
      assert.deepEqual(Array.from(service.unseenReleaseIds()), ["2026-10-26.2"]);
    });

    QUnit.test("releases newer than the last seen are new until marked seen", function (assert) {
      var store = memoryStore("2026-10-01");
      var service = new UpdatesService(RELEASES, store);
      assert.strictEqual(service.unseenCount(), 3);
      service.markSeen();
      assert.strictEqual(store.get(), "2026-10-26.2");
      assert.strictEqual(service.unseenCount(), 0);
      assert.strictEqual(service.recent(5)[0].unseen, false);
    });

    QUnit.test("recent flattens the newest changes with their release", function (assert) {
      var recent = new UpdatesService(RELEASES, memoryStore()).recent(2);
      assert.strictEqual(recent.length, 2);
      assert.strictEqual(recent[0].title, "Journey tab");
      assert.strictEqual(recent[0].date, "2026-10-26");
      assert.strictEqual(recent[0].unseen, true);
    });

    QUnit.test("filter keeps matching items and drops empty releases", function (assert) {
      var fixed = UpdatesService.filter(RELEASES, { type: "fixed", area: "", query: "" });
      assert.strictEqual(fixed.length, 1);
      assert.strictEqual(fixed[0].id, "2026-10-09");
      var platform = UpdatesService.filter(RELEASES, { type: "", area: "platform", query: "" });
      assert.deepEqual(
        platform.map(function (release) {
          return release.items.length;
        }),
        [1],
      );
      var words = UpdatesService.filter(RELEASES, { type: "", area: "", query: "moves MESSAGE" });
      assert.strictEqual(words.length, 1, "every word must match, case-insensitively");
      assert.strictEqual(
        UpdatesService.filter(RELEASES, { type: "", area: "", query: "nothing-like-this" }).length,
        0,
      );
    });

    QUnit.test("the shipped release notes are well formed", function (assert) {
      var releases = ReleaseNotes.RELEASES;
      assert.ok(releases.length > 0);
      for (var i = 1; i < releases.length; i += 1) {
        assert.ok(releases[i - 1].id > releases[i].id, "newest first: " + releases[i].id);
      }
      var types = ["new", "improved", "fixed"];
      var areas = ["operations", "monitoring", "recovery", "coe", "platform"];
      releases.forEach(function (release) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(release.date), release.id + " date");
        release.items.forEach(function (item) {
          assert.ok(types.indexOf(item.type) >= 0 && areas.indexOf(item.area) >= 0, item.title);
        });
      });
    });
  },
);
