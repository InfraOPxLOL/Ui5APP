import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MessageMonitoringService } from "../../../src/modules/message-monitoring/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";
import {
  MOCK_JMS_RESOLVED_QUEUE,
  MOCK_JMS_SOURCE_MESSAGE_ID,
} from "../../../src/sdk/mock/fixtures/index.js";

const QUEUE_CONFIGS: readonly QueueConfig[] = [
  {
    name: "ORDERS_Q",
    displayName: "Orders Queue",
    description: "Inbound orders",
    deadLetterQueue: "ORDERS_Q.DLQ",
    retryQueue: "ORDERS_Q.RETRY",
    priority: 1,
    enabled: true,
    retryStrategy: "manual",
    maxRetries: 3,
  },
];

function newService(): MessageMonitoringService {
  return new MessageMonitoringService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: QUEUE_CONFIGS });
  });
}

describe("modules/message-monitoring/MessageMonitoringService.list", () => {
  it("returns an enriched, paginated page", async () => {
    const page = await newService().list({ page: 1, pageSize: 10 });
    assert.equal(page.items.length, 10);
    assert.ok(page.total >= 10);
    for (const row of page.items) {
      assert.equal(row.mplId, row.messageId, "mplId aliases messageId in this domain");
      assert.equal(typeof row.tenantId, "string");
      assert.equal(typeof row.environment, "string");
      assert.ok(["retryable", "escalated", "not-applicable"].includes(row.retryStatus));
      assert.equal(typeof row.attachmentCount, "number");
      assert.equal(row.queueName, undefined, "no queue cross-reference at list scope");
    }
  });

  it("filters by severity over the bounded working set", async () => {
    const page = await newService().list({ page: 1, pageSize: 50, severity: "error" });
    assert.ok(page.items.length > 0);
    for (const row of page.items) {
      assert.equal(row.severity, "error");
    }
  });

  it("filters by exact correlationId", async () => {
    const unfiltered = await newService().list({ page: 1, pageSize: 20 });
    const target = unfiltered.items[0];
    assert.ok(target !== undefined);
    const page = await newService().list({ correlationId: target.correlationId, pageSize: 50 });
    assert.ok(page.items.length > 0);
    for (const row of page.items) {
      assert.equal(row.correlationId, target.correlationId);
    }
  });

  it("resolves the failedToday smart filter to a FAILED-status query", async () => {
    const page = await newService().list({ smartFilter: "failedToday", pageSize: 50 });
    for (const row of page.items) {
      assert.equal(row.status, "FAILED");
    }
  });

  it("resolves queue-scoped candidates without crashing when no message cross-references the queue", async () => {
    const page = await newService().list({ queue: "ORDERS_Q", pageSize: 20 });
    assert.equal(page.total, 0);
    assert.deepEqual(page.items, []);
  });
});

describe("modules/message-monitoring/MessageMonitoringService.getById", () => {
  it("returns full detail with headers/attachments/timeline/context for a known message", async () => {
    const service = newService();
    const page = await service.list({ page: 1, pageSize: 1 });
    const messageId = page.items[0]?.messageId;
    assert.ok(messageId !== undefined);

    const detail = await service.getById(messageId);
    assert.ok(detail !== undefined);
    assert.equal(detail?.mplId, messageId);
    assert.ok(Array.isArray(detail?.attachments));
    assert.ok(Array.isArray(detail?.timeline));
    assert.ok(detail !== undefined && detail.timeline.length >= 3);
    assert.ok(detail?.headerSummary !== undefined);
    assert.equal(detail?.context.messageId, messageId);
  });

  it("returns undefined for an unknown message id", async () => {
    const detail = await newService().getById("does-not-exist");
    assert.equal(detail, undefined);
  });
});

describe("modules/message-monitoring/MessageMonitoringService.getRelated", () => {
  it("groups related messages by dimension, excluding the source message", async () => {
    const service = newService();
    const page = await service.list({ page: 1, pageSize: 1 });
    const messageId = page.items[0]?.messageId;
    assert.ok(messageId !== undefined);

    const groups = await service.getRelated(messageId);
    for (const group of groups) {
      assert.ok(group.items.every((item) => item.messageId !== messageId));
      assert.ok(group.items.every((item) => item.mplId === item.messageId));
    }
  });

  it("throws a 404 HttpError for an unknown message id", async () => {
    await assert.rejects(
      () => newService().getRelated("does-not-exist"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

describe("modules/message-monitoring/MessageMonitoringService.getContext", () => {
  it("composes runtime/certificate-watch/notifications context for a known message", async () => {
    const service = newService();
    const page = await service.list({ page: 1, pageSize: 1 });
    const messageId = page.items[0]?.messageId;
    assert.ok(messageId !== undefined);

    const context = await service.getContext(messageId);
    assert.ok(context !== undefined);
    assert.equal(context?.messageId, messageId);
    assert.ok(Array.isArray(context?.certificateWatch));
    assert.ok(Array.isArray(context?.recentNotifications));
  });

  it("returns undefined for an unknown message id", async () => {
    const context = await newService().getContext("does-not-exist");
    assert.equal(context, undefined);
  });
});

describe("modules/message-monitoring/MessageMonitoringService JMS retry", () => {
  it("checkJmsEligibility recognizes the JMS-bridge correlation group", async () => {
    const result = await newService().checkJmsEligibility(MOCK_JMS_SOURCE_MESSAGE_ID);
    assert.equal(result.eligible, true);
    assert.equal(typeof result.ingressMessageId, "string");
  });

  it("checkJmsEligibility returns false for a message with no JMS bridge in its correlation group", async () => {
    const service = newService();
    const page = await service.list({ page: 1, pageSize: 1 });
    const messageId = page.items[0]?.messageId;
    assert.ok(messageId !== undefined && messageId !== MOCK_JMS_SOURCE_MESSAGE_ID);
    const result = await service.checkJmsEligibility(messageId);
    assert.equal(result.eligible, false);
    assert.equal(result.ingressMessageId, undefined);
  });

  it("checkJmsEligibility throws a 404 HttpError for an unknown message id", async () => {
    await assert.rejects(
      () => newService().checkJmsEligibility("does-not-exist"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });

  it("getRetryCheck parses the resolved queue from the real CH-Message-Queue header format and finds it there", async () => {
    const result = await newService().getRetryCheck(MOCK_JMS_SOURCE_MESSAGE_ID);
    assert.equal(result.eligible, true);
    assert.equal(result.resolvedQueue, MOCK_JMS_RESOLVED_QUEUE);
    assert.equal(result.currentQueue, MOCK_JMS_RESOLVED_QUEUE);
    assert.equal(result.resolutionSource, "original-queue");
    assert.equal(typeof result.retryCount, "number");
  });

  it("getRetryCheck reports ineligibility with a reason for a non-JMS message", async () => {
    const service = newService();
    const page = await service.list({ page: 1, pageSize: 1 });
    const messageId = page.items[0]?.messageId;
    assert.ok(messageId !== undefined && messageId !== MOCK_JMS_SOURCE_MESSAGE_ID);
    const result = await service.getRetryCheck(messageId);
    assert.equal(result.eligible, false);
    assert.equal(result.resolutionSource, "unresolved");
    assert.equal(typeof result.reason, "string");
    assert.equal(result.currentQueue, undefined);
  });

  it("retry executes a real retry call and reports the outcome", async () => {
    const result = await newService().retry(MOCK_JMS_SOURCE_MESSAGE_ID, MOCK_JMS_RESOLVED_QUEUE);
    assert.equal(result.messageId, MOCK_JMS_SOURCE_MESSAGE_ID);
    assert.equal(result.queueName, MOCK_JMS_RESOLVED_QUEUE);
    assert.equal(result.accepted, true);
    assert.equal(typeof result.note, "string");
  });
});

describe("modules/message-monitoring/MessageMonitoringService.exportRows", () => {
  it("renders every supported format with the right MIME type", async () => {
    const service = newService();
    const query = { pageSize: 10 };
    const csv = await service.exportRows(query, "csv");
    assert.equal(csv.mimeType, "text/csv");
    assert.ok(csv.content.includes("messageId"));

    const json = await service.exportRows(query, "json");
    assert.equal(json.mimeType, "application/json");
    assert.ok(JSON.parse(json.content).length > 0);

    const xml = await service.exportRows(query, "xml");
    assert.equal(xml.mimeType, "application/xml");
    assert.ok(xml.content.includes("<items>"));

    const excel = await service.exportRows(query, "excel");
    assert.equal(excel.mimeType, "application/vnd.ms-excel");
    assert.ok(excel.content.includes("Worksheet"));
  });
});
