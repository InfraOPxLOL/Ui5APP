import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ODataQueryBuilder } from "../../../src/sdk/odata/ODataQueryBuilder.js";
import { ODataFilter } from "../../../src/sdk/odata/ODataFilter.js";
import { ODataResponseParser } from "../../../src/sdk/odata/ODataResponseParser.js";
import { ODataMetadataParser } from "../../../src/sdk/odata/ODataMetadataParser.js";

describe("sdk/odata/ODataFilter", () => {
  it("renders a simple comparison", () => {
    assert.equal(ODataFilter.eq("status", "FAILED").render("v4"), "status eq 'FAILED'");
  });

  it("escapes embedded single quotes in string literals", () => {
    assert.equal(ODataFilter.eq("name", "O'Brien").render("v4"), "name eq 'O''Brien'");
  });

  it("renders date literals differently for v2 and v4", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    // v2's Edm.DateTime literal grammar carries no timezone designator — a trailing "Z" here would
    // be rejected by SAP Integration Suite's OData v1 API with an HTTP 400.
    assert.equal(
      ODataFilter.ge("startTime", date).render("v2"),
      "startTime ge datetime'2024-01-01T00:00:00.000'",
    );
    assert.equal(
      ODataFilter.ge("startTime", date).render("v4"),
      "startTime ge 2024-01-01T00:00:00.000Z",
    );
  });

  it("renders function calls", () => {
    assert.equal(
      ODataFilter.contains("integrationFlow", "Order").render("v4"),
      "contains(integrationFlow,'Order')",
    );
  });

  it("combines expressions with AND, each parenthesized", () => {
    const expr = ODataFilter.and(
      ODataFilter.eq("status", "FAILED"),
      ODataFilter.contains("flow", "Order"),
    );
    assert.equal(expr.render("v4"), "(status eq 'FAILED') and (contains(flow,'Order'))");
  });

  it("negates an expression", () => {
    const expr = ODataFilter.not(ODataFilter.eq("status", "FAILED"));
    assert.equal(expr.render("v4"), "not (status eq 'FAILED')");
  });
});

describe("sdk/odata/ODataQueryBuilder", () => {
  it("builds v4 query params including count", () => {
    const params = new ODataQueryBuilder()
      .top(50)
      .skip(10)
      .filter(ODataFilter.eq("status", "FAILED"))
      .orderBy("startTime", "desc")
      .select("messageId", "status")
      .expand("errorDetails")
      .count()
      .build("v4");

    assert.deepEqual(params, {
      $top: 50,
      $skip: 10,
      $filter: "status eq 'FAILED'",
      $orderby: "startTime desc",
      $select: "messageId,status",
      $expand: "errorDetails",
      $count: true,
    });
  });

  it("uses $inlinecount for v2 count requests", () => {
    const params = new ODataQueryBuilder().count().build("v2");
    assert.deepEqual(params, { $inlinecount: "allpages" });
  });

  it("omits unset options", () => {
    const params = new ODataQueryBuilder().top(10).build();
    assert.deepEqual(params, { $top: 10 });
  });
});

describe("sdk/odata/ODataResponseParser", () => {
  it("parses a v4 envelope", () => {
    const body = JSON.stringify({ value: [{ id: 1 }, { id: 2 }], "@odata.count": 2 });
    const parsed = ODataResponseParser.parse<{ id: number }>(body, "corr-1", 5);
    assert.deepEqual(parsed.value, [{ id: 1 }, { id: 2 }]);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.correlationId, "corr-1");
  });

  it("parses a v2 envelope", () => {
    const body = JSON.stringify({ d: { results: [{ id: 1 }], __count: "1" } });
    const parsed = ODataResponseParser.parse<{ id: number }>(body, "corr-2", 3);
    assert.deepEqual(parsed.value, [{ id: 1 }]);
    assert.equal(parsed.count, 1);
  });

  it("converts a parsed response into a paged response", () => {
    const body = JSON.stringify({ value: [{ id: 1 }], "@odata.count": 40 });
    const parsed = ODataResponseParser.parse<{ id: number }>(body, "corr-3", 2);
    const paged = ODataResponseParser.toPagedResponse(parsed, 10, 20);
    assert.equal(paged.total, 40);
    assert.equal(paged.skip, 10);
    assert.equal(paged.top, 20);
  });
});

describe("sdk/odata/ODataMetadataParser", () => {
  const metadata = `<?xml version="1.0"?>
    <edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
      <EntityType Name="MessageProcessingLog">
        <Property Name="MessageGuid" Type="Edm.String" Nullable="false"/>
        <Property Name="Status" Type="Edm.String"/>
      </EntityType>
    </edmx:Edmx>`;

  it("extracts entity types and their properties", () => {
    const types = ODataMetadataParser.parse(metadata);
    assert.equal(types.length, 1);
    assert.equal(types[0]?.name, "MessageProcessingLog");
    assert.equal(types[0]?.properties.length, 2);
    assert.equal(types[0]?.properties[0]?.nullable, false);
    assert.equal(types[0]?.properties[1]?.nullable, true);
  });

  it("finds a single entity type by name", () => {
    const type = ODataMetadataParser.findEntityType(metadata, "MessageProcessingLog");
    assert.ok(type !== undefined);
    assert.equal(type?.properties[1]?.name, "Status");
  });
});
