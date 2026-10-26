/**
 * Unit tests for the non-B2B Report Server formatter: query building, saved-view round trips,
 * merging paged transactions, status tiles, and JMS stage states.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/reportServer/TransactionFormatter"],
  function (TransactionFormatter) {
    "use strict";

    QUnit.module("modules/reportServer/formatter/TransactionFormatter");

    function row(correlationId, statusCategory, lastActivityAt, stepCount) {
      return {
        correlationId: correlationId,
        statusCategory: statusCategory,
        lastActivityAt: lastActivityAt,
        stepCount: stepCount,
      };
    }

    QUnit.test(
      "a fresh screen searches the last 24 hours with nothing else set",
      function (assert) {
        var filters = TransactionFormatter.defaultFilters();
        assert.strictEqual(filters.timePreset, "1d");
        assert.strictEqual(filters.framework, "");
        assert.strictEqual(filters.correlationId, "");
        assert.strictEqual(TransactionFormatter.advancedCount(filters), 0);
      },
    );

    QUnit.test(
      "toQuery resolves the window at search time, trims text and drops unset fields",
      function (assert) {
        var filters = TransactionFormatter.defaultFilters();
        filters.timePreset = "1h";
        filters.sender = "  S4_LA ";
        filters.framework = "jms";
        filters.correlationId = " AGh-corr ";
        var now = new Date(Date.UTC(2026, 9, 26, 12, 0, 0));
        assert.deepEqual(TransactionFormatter.toQuery(filters, 2, 50, now), {
          dateFrom: "2026-10-26T11:00:00.000Z",
          sender: "S4_LA",
          framework: "jms",
          correlationId: "AGh-corr",
          page: 2,
          pageSize: 50,
        });
        filters.timePreset = "all";
        assert.strictEqual(TransactionFormatter.toQuery(filters, 1, 50, now).dateFrom, undefined);
      },
    );

    QUnit.test("advancedCount counts only the fields behind 'More filters'", function (assert) {
      var filters = TransactionFormatter.defaultFilters();
      filters.sender = "S4";
      filters.integrationFlow = "IF_Order";
      filters.mplId = "AGh";
      filters.messageType = "  ";
      assert.strictEqual(TransactionFormatter.advancedCount(filters), 1);
      assert.strictEqual(TransactionFormatter.advancedCount(undefined), 0);
    });

    QUnit.test(
      "a saved view round-trips through JSON, keeping relative windows relative",
      function (assert) {
        var filters = TransactionFormatter.defaultFilters();
        filters.timePreset = "7d";
        filters.receiver = "SFDC_LATAM";
        filters.framework = "router";
        var restored = TransactionFormatter.fromViewState(
          JSON.parse(JSON.stringify(TransactionFormatter.toViewState(filters, false))),
        );
        assert.strictEqual(restored.filters.timePreset, "7d");
        assert.strictEqual(restored.filters.receiver, "SFDC_LATAM");
        assert.strictEqual(restored.filters.framework, "router");
        assert.strictEqual(restored.filters.dateFrom, null);
        assert.strictEqual(restored.advanced, false);

        filters.timePreset = "custom";
        filters.dateFrom = new Date(Date.UTC(2026, 0, 1));
        var custom = TransactionFormatter.fromViewState(
          JSON.parse(JSON.stringify(TransactionFormatter.toViewState(filters, false))),
        );
        assert.strictEqual(custom.filters.dateFrom.toISOString(), "2026-01-01T00:00:00.000Z");
      },
    );

    QUnit.test(
      "fromViewState falls back to defaults for anything missing or malformed",
      function (assert) {
        var restored = TransactionFormatter.fromViewState({
          filters: {
            timePreset: "2y",
            sender: 42,
            framework: "tpm",
            applicationId: "0000482555",
            dateFrom: "not a date",
          },
        });
        assert.strictEqual(restored.filters.timePreset, "1d");
        assert.strictEqual(restored.filters.sender, "");
        assert.strictEqual(restored.filters.framework, "", "an unknown framework is dropped");
        assert.strictEqual(restored.filters.applicationId, "0000482555");
        assert.strictEqual(restored.filters.dateFrom, null);
        assert.strictEqual(
          restored.advanced,
          true,
          "an advanced field set opens the advanced search",
        );
        assert.strictEqual(TransactionFormatter.fromViewState(undefined).filters.timePreset, "1d");
      },
    );

    QUnit.test(
      "merge keeps one row per correlation id, the fuller reading winning",
      function (assert) {
        var merged = TransactionFormatter.merge(
          [
            row("a", "inProgress", "2026-10-26T10:00:00Z", 2),
            row("b", "success", "2026-10-26T09:00:00Z", 3),
          ],
          [
            row("a", "success", "2026-10-26T11:00:00Z", 4),
            row("b", "error", "2026-10-26T09:30:00Z", 1),
          ],
        );
        assert.deepEqual(
          merged.map(function (item) {
            return item.correlationId + ":" + item.statusCategory;
          }),
          ["a:success", "b:success"],
          "a grew to four steps; b's partial page reading does not replace its fuller one",
        );
      },
    );

    QUnit.test("merge sorts by latest activity, newest first", function (assert) {
      var merged = TransactionFormatter.merge(
        [row("old", "success", "2026-10-25T08:00:00Z", 1)],
        [row("new", "error", "2026-10-26T08:00:00Z", 1)],
      );
      assert.deepEqual(
        merged.map(function (item) {
          return item.correlationId;
        }),
        ["new", "old"],
      );
    });

    QUnit.test("tiles lead with 'all', then only the categories that occur", function (assert) {
      var rows = [
        row("a", "success", "2026-10-26T10:00:00Z", 1),
        row("b", "error", "2026-10-26T10:00:00Z", 1),
        row("c", "success", "2026-10-26T10:00:00Z", 1),
      ];
      assert.deepEqual(TransactionFormatter.tiles(rows), [
        { key: "", count: 3, valueColor: "Neutral" },
        { key: "success", count: 2, valueColor: "Good" },
        { key: "error", count: 1, valueColor: "Error" },
      ]);
      assert.deepEqual(TransactionFormatter.tiles([]), [
        { key: "", count: 0, valueColor: "Neutral" },
      ]);
      assert.strictEqual(TransactionFormatter.byCategory(rows, "success").length, 2);
      assert.strictEqual(TransactionFormatter.byCategory(rows, "").length, 3);
    });

    QUnit.test("path text and JMS stage states", function (assert) {
      assert.strictEqual(
        TransactionFormatter.pathText([
          "Common IDoc Router (BTP_IS_CORE_LA)",
          "JMS · Common_JMS_ID_NA_P1",
          "IF_Order_to_SFDC",
        ]),
        "Common IDoc Router (BTP_IS_CORE_LA) → JMS · Common_JMS_ID_NA_P1 → IF_Order_to_SFDC",
      );
      assert.strictEqual(TransactionFormatter.pathText(undefined), "");
      assert.strictEqual(TransactionFormatter.jmsStageState("delivered"), "Success");
      assert.strictEqual(TransactionFormatter.jmsStageState("queued"), "Information");
      assert.strictEqual(TransactionFormatter.jmsStageState("retrying"), "Warning");
      assert.strictEqual(TransactionFormatter.jmsStageState("failed"), "Error");
      assert.strictEqual(TransactionFormatter.jmsStageState(undefined), "None");
    });
  },
);
