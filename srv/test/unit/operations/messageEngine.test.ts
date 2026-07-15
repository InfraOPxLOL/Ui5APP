import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MessageEngine } from "../../../src/operations/engines/MessageEngine.js";
import { MonitoringClient } from "../../../src/sdk/client/MonitoringClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import { OperationsQueryBuilder } from "../../../src/operations/models/index.js";
import type { IMonitoringProvider } from "../../../src/core/providers/IMonitoringProvider.js";
import type { MessageProcessingLog } from "../../../src/core/providers/types.js";

const LOGS: MessageProcessingLog[] = [
  {
    messageId: "m1",
    correlationId: "corr-1",
    integrationFlow: "IF1",
    status: "FAILED",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:05.000Z",
    processingTimeMs: 5000,
    sender: "SAP_S4HANA",
    receiver: "SFTP_PARTNER",
    customStatus: undefined,
    applicationId: "APP1",
    messageType: "ORDERS",
  },
  {
    messageId: "m2",
    correlationId: "corr-1",
    integrationFlow: "IF2",
    status: "COMPLETED",
    startTime: "2024-01-02T00:00:00.000Z",
    endTime: "2024-01-02T00:00:00.500Z",
    processingTimeMs: 500,
    sender: "SAP_Ariba",
    receiver: "SAP_S4HANA",
    customStatus: undefined,
    applicationId: "APP2",
    messageType: "INVOIC",
  },
];

function stubProvider(): IMonitoringProvider {
  return {
    queryMessageLogs: (_context, filter, page) => {
      const filtered = LOGS.filter((log) => {
        if (filter.status !== undefined && log.status !== filter.status) {
          return false;
        }
        if (
          filter.integrationFlow !== undefined &&
          log.integrationFlow !== filter.integrationFlow
        ) {
          return false;
        }
        return true;
      });
      return Promise.resolve({
        items: filtered.slice(page.skip, page.skip + page.top),
        total: filtered.length,
      });
    },
    getMessageLog: (_context, messageId) =>
      Promise.resolve(LOGS.find((log) => log.messageId === messageId)),
    getErrorDetails: (_context, messageId) =>
      Promise.resolve([{ messageId, text: "boom", category: "TECHNICAL" }]),
    countByStatus: () => Promise.resolve({ FAILED: 1, COMPLETED: 1 }),
    getCustomHeaders: (_context, messageId) =>
      Promise.resolve(messageId === "m1" ? [{ name: "X-Test", value: "yes" }] : []),
  };
}

function newEngine(): MessageEngine {
  const client = new MonitoringClient(stubProvider(), "primary");
  return new MessageEngine(client, new OperationsCache());
}

describe("operations/engines/MessageEngine", () => {
  it("queryMessages enriches, filters and paginates", async () => {
    const engine = newEngine();
    const query = new OperationsQueryBuilder().status("FAILED").page(1).pageSize(10).build();
    const result = await engine.queryMessages(query);
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.messageId, "m1");
    assert.equal(result.items[0]?.severity, "error");
    assert.equal(result.items[0]?.humanReadableStatus, "Failed");
    assert.equal(result.items[0]?.processingTimeHuman, "5.0 s");
  });

  it("getMessage returns full details including error details for a failed message", async () => {
    const engine = newEngine();
    const details = await engine.getMessage("m1");
    assert.equal(details?.mplId, "m1");
    assert.equal(details?.errorDetails.length, 1);
    assert.deepEqual(details?.sapStandardHeaders, {});
  });

  it("getMessage returns no error details for a completed message", async () => {
    const engine = newEngine();
    const details = await engine.getMessage("m2");
    assert.deepEqual(details?.errorDetails, []);
  });

  it("getMessage returns undefined for an unknown id", async () => {
    const engine = newEngine();
    assert.equal(await engine.getMessage("missing"), undefined);
  });

  it("getMessageStatus/getProcessingDuration project from getMessage", async () => {
    const engine = newEngine();
    assert.equal(await engine.getMessageStatus("m1"), "FAILED");
    assert.equal(await engine.getProcessingDuration("m1"), 5000);
  });

  it("findByCorrelationId finds every message sharing a correlation id", async () => {
    const engine = newEngine();
    const found = await engine.findByCorrelationId("corr-1");
    assert.equal(found.length, 2);
  });

  it("sortBy sorts the working set before pagination", async () => {
    const engine = newEngine();
    const query = new OperationsQueryBuilder().sortBy("processingTimeMs").asc().build();
    const result = await engine.queryMessages(query);
    assert.deepEqual(
      result.items.map((item) => item.messageId),
      ["m2", "m1"],
    );
  });
});
