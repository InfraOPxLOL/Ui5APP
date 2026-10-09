/**
 * Unit tests for TimePresets: relative windows resolve against the given clock, months are calendar
 * months, "all" is unbounded and "custom" passes the explicit range through.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/core/utils/TimePresets"],
  function (TimePresets) {
    "use strict";

    QUnit.module("core/utils/TimePresets");

    var NOW = new Date(Date.UTC(2026, 9, 9, 12, 0, 0));

    QUnit.test("relative presets end open and start the right distance back", function (assert) {
      assert.strictEqual(
        TimePresets.resolve("1m", undefined, NOW).from.toISOString(),
        "2026-10-09T11:59:00.000Z",
      );
      assert.strictEqual(
        TimePresets.resolve("1h", undefined, NOW).from.toISOString(),
        "2026-10-09T11:00:00.000Z",
      );
      assert.strictEqual(
        TimePresets.resolve("1d", undefined, NOW).from.toISOString(),
        "2026-10-08T12:00:00.000Z",
      );
      assert.strictEqual(
        TimePresets.resolve("7d", undefined, NOW).from.toISOString(),
        "2026-10-02T12:00:00.000Z",
      );
      assert.strictEqual(TimePresets.resolve("1h", undefined, NOW).to, undefined);
    });

    QUnit.test("month presets step back calendar months", function (assert) {
      assert.strictEqual(TimePresets.resolve("1mo", undefined, NOW).from.getUTCMonth(), 8);
      assert.strictEqual(TimePresets.resolve("3mo", undefined, NOW).from.getUTCMonth(), 6);
    });

    QUnit.test("any time is unbounded; custom passes its range through", function (assert) {
      assert.deepEqual(TimePresets.resolve("all", undefined, NOW), {});
      var from = new Date(Date.UTC(2026, 0, 1));
      var custom = TimePresets.resolve("custom", { from: from, to: null }, NOW);
      assert.strictEqual(custom.from, from);
      assert.strictEqual(custom.to, undefined);
    });

    QUnit.test("knows its own keys, in dropdown order", function (assert) {
      assert.ok(TimePresets.isKey("15m"));
      assert.notOk(TimePresets.isKey("2y"));
      assert.deepEqual(
        TimePresets.ALL.map(function (preset) {
          return preset.code;
        }),
        ["1m", "15m", "1H", "4H", "1D", "7D", "1M", "3M", "∞", "…"],
      );
    });
  },
);
