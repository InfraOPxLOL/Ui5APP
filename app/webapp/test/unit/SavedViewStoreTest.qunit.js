/**
 * Unit tests for SavedViewStore: saving, overwriting by name, renaming, deleting, the default view,
 * persistence through the storage it is given, and tolerance of corrupt storage.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/core/services/views/SavedViewStore"],
  function (SavedViewStoreModule) {
    "use strict";

    var SavedViewStore = SavedViewStoreModule.default || SavedViewStoreModule;
    var STANDARD = SavedViewStoreModule.STANDARD_VIEW_KEY || "standard";

    function fakeStorage(initial) {
      var values = Object.assign({}, initial || {});
      return {
        values: values,
        getItem: function (key) {
          return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem: function (key, value) {
          values[key] = value;
        },
      };
    }

    function clock() {
      return new Date(Date.UTC(2026, 9, 9, 12, 0, 0));
    }

    QUnit.module("core/services/views/SavedViewStore");

    QUnit.test("saves views and lists them alphabetically", function (assert) {
      var store = new SavedViewStore("scope", fakeStorage(), clock);
      store.save("Walmart failures", { status: "FAILED" });
      store.save("Amazon orders", { partner: "AMAZON" });
      assert.deepEqual(
        store.list().map(function (view) {
          return view.name;
        }),
        ["Amazon orders", "Walmart failures"],
      );
    });

    QUnit.test("saving under an existing name or key overwrites in place", function (assert) {
      var store = new SavedViewStore("scope", fakeStorage(), clock);
      var first = store.save("Failures", { status: "FAILED" });
      store.save("failures", { status: "ERROR" });
      assert.strictEqual(store.list().length, 1);
      assert.deepEqual(store.get(first.key).state, { status: "ERROR" });
      store.save("Renamed via key", { status: "X" }, first.key);
      assert.strictEqual(store.list().length, 1);
      assert.strictEqual(store.get(first.key).name, "Renamed via key");
    });

    QUnit.test("persists through the storage, scoped per screen", function (assert) {
      var storage = fakeStorage();
      new SavedViewStore("reportServer", storage, clock).save("Mine", { a: 1 });
      assert.strictEqual(new SavedViewStore("reportServer", storage, clock).list().length, 1);
      assert.strictEqual(new SavedViewStore("otherScreen", storage, clock).list().length, 0);
    });

    QUnit.test("the default view falls back to standard when it is deleted", function (assert) {
      var store = new SavedViewStore("scope", fakeStorage(), clock);
      assert.strictEqual(store.getDefaultKey(), STANDARD);
      var view = store.save("Mine", {});
      store.setDefault(view.key);
      assert.strictEqual(store.getDefaultKey(), view.key);
      store.remove(view.key);
      assert.strictEqual(store.getDefaultKey(), STANDARD);
      store.setDefault("no-such-view");
      assert.strictEqual(store.getDefaultKey(), STANDARD);
    });

    QUnit.test("renames a view", function (assert) {
      var store = new SavedViewStore("scope", fakeStorage(), clock);
      var view = store.save("Old", {});
      store.rename(view.key, "  New  ");
      assert.strictEqual(store.get(view.key).name, "New");
    });

    QUnit.test("reads corrupt or foreign storage as empty instead of failing", function (assert) {
      var store = new SavedViewStore(
        "scope",
        fakeStorage({ "integrationPortal.views.scope": "{not json" }),
        clock,
      );
      assert.deepEqual(store.list(), []);
      var broken = {
        getItem: function () {
          throw new Error("blocked");
        },
        setItem: function () {
          throw new Error("blocked");
        },
      };
      var blocked = new SavedViewStore("scope", broken, clock);
      assert.deepEqual(blocked.list(), []);
      blocked.save("Still works for the call", {});
      assert.ok(true, "a blocked storage never throws");
    });
  },
);
