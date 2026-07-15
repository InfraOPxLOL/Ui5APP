import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OperationsQueryBuilder,
  DEFAULT_OPERATIONS_QUERY,
  toProviderPage,
} from "../../../src/operations/models/OperationsQuery.js";

describe("operations/models/OperationsQueryBuilder", () => {
  it("builds a query matching the architecture's fluent example", () => {
    const query = new OperationsQueryBuilder()
      .status("FAILED")
      .sender("SAP")
      .receiver("S4")
      .messageType("ORDERS")
      .customStatus("BusinessError")
      .applicationId("XYZ")
      .page(1)
      .pageSize(100)
      .sortBy("startTime")
      .desc()
      .build();

    assert.equal(query.status, "FAILED");
    assert.equal(query.sender, "SAP");
    assert.equal(query.receiver, "S4");
    assert.equal(query.messageType, "ORDERS");
    assert.equal(query.customStatus, "BusinessError");
    assert.equal(query.applicationId, "XYZ");
    assert.equal(query.page, 1);
    assert.equal(query.pageSize, 100);
    assert.equal(query.sortBy, "startTime");
    assert.equal(query.sortDirection, "desc");
  });

  it("defaults page/pageSize/sortDirection/include flags when unset", () => {
    const query = new OperationsQueryBuilder().build();
    assert.deepEqual(query, DEFAULT_OPERATIONS_QUERY);
  });

  it("asc()/desc() toggle sort direction", () => {
    assert.equal(new OperationsQueryBuilder().asc().build().sortDirection, "asc");
    assert.equal(new OperationsQueryBuilder().desc().build().sortDirection, "desc");
  });

  it("select() and the include*() flags are captured", () => {
    const query = new OperationsQueryBuilder()
      .select("messageId", "status")
      .includePayload()
      .includeAttachments()
      .includeHeaders()
      .build();
    assert.deepEqual(query.select, ["messageId", "status"]);
    assert.equal(query.includePayload, true);
    assert.equal(query.includeAttachments, true);
    assert.equal(query.includeHeaders, true);
  });

  it("durationRange() sets both bounds", () => {
    const query = new OperationsQueryBuilder().durationRange(100, 5000).build();
    assert.equal(query.durationMinMs, 100);
    assert.equal(query.durationMaxMs, 5000);
  });
});

describe("operations/models/toProviderPage", () => {
  it("converts 1-based page/pageSize into 0-based skip/top", () => {
    assert.deepEqual(toProviderPage({ ...DEFAULT_OPERATIONS_QUERY, page: 1, pageSize: 50 }), {
      skip: 0,
      top: 50,
    });
    assert.deepEqual(toProviderPage({ ...DEFAULT_OPERATIONS_QUERY, page: 3, pageSize: 20 }), {
      skip: 40,
      top: 20,
    });
  });

  it("clamps page/pageSize below 1 up to 1", () => {
    assert.deepEqual(toProviderPage({ ...DEFAULT_OPERATIONS_QUERY, page: 0, pageSize: 0 }), {
      skip: 0,
      top: 1,
    });
  });
});
