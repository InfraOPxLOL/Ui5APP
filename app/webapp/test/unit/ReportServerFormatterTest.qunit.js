/**
 * Unit tests for the Report Server formatter: status mapping, party/document text, payload editor
 * type, filter-to-query conversion and the status tiles built from the server's counts.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/formatter/reportServer/ReportServerFormatter"],
  function (ReportServerFormatter) {
    "use strict";

    QUnit.module("modules/reportServer/formatter/ReportServerFormatter");

    QUnit.test("statusState and statusIcon follow the status category", function (assert) {
      assert.strictEqual(ReportServerFormatter.statusState("success"), "Success");
      assert.strictEqual(ReportServerFormatter.statusState("error"), "Error");
      assert.strictEqual(ReportServerFormatter.statusState("inProgress"), "Warning");
      assert.strictEqual(ReportServerFormatter.statusState("unknown"), "None");
      assert.strictEqual(ReportServerFormatter.statusState(undefined), "None");
      assert.strictEqual(ReportServerFormatter.statusIcon("error"), "sap-icon://error");
      assert.strictEqual(ReportServerFormatter.statusIcon(undefined), "sap-icon://question-mark");
    });

    QUnit.test("partner falls back to the communication partner, then a dash", function (assert) {
      assert.strictEqual(
        ReportServerFormatter.partner({ tradingPartnerName: "AMAZONJP (Hills)" }),
        "AMAZONJP (Hills)",
      );
      assert.strictEqual(
        ReportServerFormatter.partner({ communicationPartnerName: "AMAZONJP" }),
        "AMAZONJP",
      );
      assert.strictEqual(ReportServerFormatter.partner(undefined), "—");
    });

    QUnit.test("document joins standard and message type, whichever is known", function (assert) {
      assert.strictEqual(
        ReportServerFormatter.document({ documentStandard: "ASC-X12", messageType: "850" }),
        "ASC-X12 · 850",
      );
      assert.strictEqual(ReportServerFormatter.document({ messageType: "ORDERS" }), "ORDERS");
      assert.strictEqual(ReportServerFormatter.document({}), "—");
    });

    QUnit.test(
      "editorType highlights XML and JSON, and shows EDI as plain text",
      function (assert) {
        assert.strictEqual(ReportServerFormatter.editorType("xml"), "xml");
        assert.strictEqual(ReportServerFormatter.editorType("json"), "json");
        assert.strictEqual(ReportServerFormatter.editorType("edi"), "text");
        assert.strictEqual(ReportServerFormatter.fileExtension("edi"), "edi");
        assert.strictEqual(ReportServerFormatter.fileExtension("binary"), "bin");
      },
    );

    QUnit.test("toQuery drops unset filters, trims text and serialises dates", function (assert) {
      var from = new Date(Date.UTC(2026, 9, 1, 0, 0, 0));
      var query = ReportServerFormatter.toQuery(
        {
          dateFrom: from,
          dateTo: null,
          status: "",
          senderPartner: "  AMAZONJP ",
          receiverPartner: "",
          documentStandard: "ASC-X12",
          messageType: "",
          controlNumber: "",
        },
        2,
        50,
      );
      assert.deepEqual(query, {
        dateFrom: "2026-10-01T00:00:00.000Z",
        senderPartner: "AMAZONJP",
        documentStandard: "ASC-X12",
        page: 2,
        pageSize: 50,
      });
    });

    QUnit.test("tiles lead with an 'all' tile, then one per reported status", function (assert) {
      var tiles = ReportServerFormatter.tiles({
        total: 12,
        truncated: false,
        counts: [
          { status: "COMPLETED", category: "success", count: 9 },
          { status: "FAILED", category: "error", count: 3 },
        ],
      });
      assert.strictEqual(tiles.length, 3);
      assert.strictEqual(tiles[0].category, "all");
      assert.strictEqual(tiles[0].count, 12);
      assert.strictEqual(tiles[0].key, "");
      assert.strictEqual(tiles[2].key, "FAILED");
      assert.strictEqual(tiles[2].valueColor, "Error");
      assert.deepEqual(ReportServerFormatter.tiles(undefined), []);
    });
  },
);
