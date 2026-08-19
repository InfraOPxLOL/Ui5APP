import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MessageMonitoringService } from "../../../src/modules/message-monitoring/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";
import { frameworksSchema, type FrameworkConfig } from "../../../src/config/schemas/index.js";
import {
  MOCK_JMS_RESOLVED_QUEUE,
  MOCK_JMS_SOURCE_MESSAGE_ID,
  MOCK_TPM_INBOUND_MESSAGE_ID,
  MOCK_TPM_INBOUND_QUEUE,
  MOCK_TPM_ORPHAN_MESSAGE_ID,
  MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
  MOCK_ROUTER_DLQ_MESSAGE_ID,
  MOCK_STATUS_SYNC_DLQ_MESSAGE_ID,
  resetMockMoves,
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

/**
 * The framework registry the service is exercised against — the shipped `config/frameworks.json`
 * topology, parsed through the real schema so these tests and boot agree on defaults.
 */
const FRAMEWORK_CONFIGS: readonly FrameworkConfig[] = frameworksSchema.parse({
  frameworks: [
    {
      id: "JMS_FRAMEWORK",
      label: "JMS Framework",
      priority: 1,
      detect: { correlationFlowNames: ["IF_JMS_ingress", "IF_JMS_egress"] },
      queueResolution: {
        headerName: "CH-Message-Queue",
        headerValuePattern: "\\[[^\\[\\]]*=\\s*([^\\]]+)\\]\\s*$",
        centralDeadLetterQueue: "Common_JMS_ID_DLQ",
      },
    },
    {
      id: "TPM_V2",
      label: "TPM V2",
      priority: 2,
      detect: { integrationFlowPatterns: ["^SAP_TPM_", "_TPM_"] },
      topology: {
        traversalOrder: [
          "SAP_TPM_INBOUND_Q",
          "SAP_TPM_OUTBOUND_Q",
          "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
          "SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q",
        ],
        activeQueues: ["SAP_TPM_INBOUND_Q", "SAP_TPM_OUTBOUND_Q"],
        deadLetterQueues: [
          "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
          "SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q",
        ],
        dlqRecoveryMap: {
          SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q: "SAP_TPM_INBOUND_Q",
          SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q: "SAP_TPM_OUTBOUND_Q",
        },
      },
    },
    {
      id: "COMMON_IDOC_ROUTER",
      label: "Common IDoc Router",
      priority: 3,
      topology: {
        traversalOrder: ["Common_Router_JMS", "Common_Router_JMS_DLQ"],
        activeQueues: ["Common_Router_JMS"],
        deadLetterQueues: ["Common_Router_JMS_DLQ"],
        dlqRecoveryMap: { Common_Router_JMS_DLQ: "Common_Router_JMS" },
      },
    },
    {
      id: "IDOC_STATUS_SYNC",
      label: "IDoc Status Sync",
      priority: 4,
      topology: {
        traversalOrder: ["Status_JMS", "Status_JMS_DLQ"],
        activeQueues: ["Status_JMS"],
        deadLetterQueues: ["Status_JMS_DLQ"],
        dlqRecoveryMap: { Status_JMS_DLQ: "Status_JMS" },
      },
    },
  ],
}).frameworks;

function newService(): MessageMonitoringService {
  return new MessageMonitoringService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({
      sdk,
      queueConfigs: QUEUE_CONFIGS,
      frameworkConfigs: FRAMEWORK_CONFIGS,
    });
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

describe("modules/message-monitoring/MessageMonitoringService framework awareness", () => {
  it("returns a framework and recovery state on every list row", async () => {
    const page = await newService().list({ page: 1, pageSize: 25 });
    assert.ok(page.items.length > 0);
    for (const row of page.items) {
      assert.ok(
        [
          "TPM_V2",
          "JMS_FRAMEWORK",
          "COMMON_IDOC_ROUTER",
          "IDOC_STATUS_SYNC",
          "NON_FRAMEWORK",
          "UNKNOWN",
        ].includes(row.framework),
      );
      assert.ok(["confirmed", "probable", "none"].includes(row.frameworkConfidence));
      assert.equal(typeof row.recoveryState, "string");
    }
  });

  it("classifies the JMS bridge fixture from its correlation chain at list scope", async () => {
    const page = await newService().list({ page: 1, pageSize: 50 });
    const row = page.items.find((item) => item.messageId === MOCK_JMS_SOURCE_MESSAGE_ID);
    assert.ok(row !== undefined);
    assert.equal(row?.framework, "JMS_FRAMEWORK");
    assert.equal(row?.frameworkConfidence, "confirmed");
  });

  it("classifies a TPM message from its flow name, at probable confidence", async () => {
    const page = await newService().list({ page: 1, pageSize: 50 });
    const row = page.items.find((item) => item.messageId === MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID);
    assert.ok(row !== undefined);
    assert.equal(row?.framework, "TPM_V2");
    assert.equal(row?.frameworkConfidence, "probable");
  });

  it("filters the list by framework", async () => {
    const page = await newService().list({ pageSize: 50, framework: "TPM_V2" });
    assert.ok(page.items.length > 0);
    assert.ok(page.items.every((row) => row.framework === "TPM_V2"));
    assert.equal(page.total, page.items.length);
  });

  it("filters the list by recovery state", async () => {
    const page = await newService().list({ pageSize: 50, recoveryState: "RECOVERABLE" });
    assert.ok(page.items.every((row) => row.recoveryState === "RECOVERABLE"));
  });

  it("treats framework and recovery state as independent axes", async () => {
    const page = await newService().list({
      pageSize: 50,
      framework: "TPM_V2",
      recoveryState: "RECOVERABLE",
    });
    // The TPM fixtures are all FAILED, so combining the two filters must not empty the result —
    // proving the two criteria intersect rather than one subsuming the other.
    assert.ok(page.items.length > 0);
    for (const row of page.items) {
      assert.equal(row.framework, "TPM_V2");
      assert.equal(row.recoveryState, "RECOVERABLE");
    }
  });

  it("carries the framework columns into exports", async () => {
    const csv = await newService().exportRows({ pageSize: 10 }, "csv");
    assert.ok(csv.content.includes("framework"));
    assert.ok(csv.content.includes("recoveryState"));
  });

  it("getFramework resolves a queue-topology-only framework that list scope leaves UNKNOWN", async () => {
    const service = newService();
    const page = await service.list({ pageSize: 50 });
    const listRow = page.items.find((item) => item.messageId === MOCK_ROUTER_DLQ_MESSAGE_ID);
    assert.ok(listRow !== undefined);
    assert.equal(
      listRow?.framework,
      "UNKNOWN",
      "no configured rule matches it without probing queues",
    );

    const detection = await service.getFramework(MOCK_ROUTER_DLQ_MESSAGE_ID);
    assert.equal(detection.framework, "COMMON_IDOC_ROUTER");
    assert.equal(detection.confidence, "confirmed");
    assert.equal(detection.queueRole, "DLQ");
  });

  it("getFramework returns UNKNOWN with evidence rather than guessing", async () => {
    const service = newService();
    const page = await service.list({ pageSize: 5 });
    const plain = page.items.find(
      (item) => item.framework === "UNKNOWN" || item.framework === "NON_FRAMEWORK",
    );
    if (plain === undefined) {
      return;
    }
    const detection = await service.getFramework(plain.messageId);
    assert.ok(detection.evidence.length > 0, "an unresolved result must still explain itself");
  });

  it("getFramework throws a 404 for an unknown message id", async () => {
    await assert.rejects(
      () => newService().getFramework("does-not-exist"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

describe("modules/message-monitoring/MessageMonitoringService recovery plans", () => {
  it("plans a move-then-retry for a message on the TPM processing DLQ", async () => {
    const plan = await newService().getRecoveryPlan(MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID);
    assert.equal(plan.framework, "TPM_V2");
    assert.equal(plan.action, "MOVE_THEN_RETRY");
    assert.equal(plan.moveRequired, true);
    assert.equal(plan.targetQueue, MOCK_TPM_INBOUND_QUEUE);
    assert.equal(plan.recoveryState, "DLQ_RECOVERY_AVAILABLE");
    assert.deepEqual(
      plan.path.map((step) => step.action),
      ["LOCATED", "MOVE", "VERIFY", "RETRY"],
    );
  });

  it("plans a retry in place for a message on an active TPM queue", async () => {
    const plan = await newService().getRecoveryPlan(MOCK_TPM_INBOUND_MESSAGE_ID);
    assert.equal(plan.action, "RETRY_IN_PLACE");
    assert.equal(plan.moveRequired, false);
    assert.equal(plan.recoveryState, "RETRY_AVAILABLE");
  });

  it("reports NOT_FOUND for a framework message sitting on none of its queues", async () => {
    const plan = await newService().getRecoveryPlan(MOCK_TPM_ORPHAN_MESSAGE_ID);
    assert.equal(plan.framework, "TPM_V2");
    assert.equal(plan.recoveryState, "NOT_FOUND");
    assert.equal(plan.executable, false);
  });

  it("plans an IDoc Status Sync DLQ recovery", async () => {
    const plan = await newService().getRecoveryPlan(MOCK_STATUS_SYNC_DLQ_MESSAGE_ID);
    assert.equal(plan.framework, "IDOC_STATUS_SYNC");
    assert.equal(plan.targetQueue, "Status_JMS");
  });

  it("builds a bulk plan that separates executable from excluded messages", async () => {
    const batch = await newService().buildRecoveryPlan([
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      MOCK_TPM_ORPHAN_MESSAGE_ID,
    ]);
    assert.equal(batch.plans.length, 2, "every selected message is shown to the operator");
    assert.deepEqual(batch.executableMessageIds, [MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID]);
    assert.equal(batch.executableCount, 1);
    assert.equal(batch.excludedCount, 1);
  });

  it("skips unknown message ids in a bulk plan rather than failing the whole batch", async () => {
    const batch = await newService().buildRecoveryPlan([
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      "does-not-exist",
    ]);
    assert.equal(batch.plans.length, 1);
    assert.deepEqual(batch.executableMessageIds, [MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID]);
  });

  it("getRecoveryPlan throws a 404 for an unknown message id", async () => {
    await assert.rejects(
      () => newService().getRecoveryPlan("does-not-exist"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

describe("modules/message-monitoring/MessageMonitoringService.recover", () => {
  it("executes a real move, verify and retry for a dead-lettered TPM message", async () => {
    resetMockMoves();
    const outcome = await newService().recover(MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID);

    assert.equal(outcome.framework, "TPM_V2");
    assert.equal(outcome.status, "accepted");
    assert.deepEqual(
      outcome.steps.map((step) => step.action),
      ["LOCATED", "MOVE", "VERIFY", "RETRY"],
    );
    assert.ok(outcome.steps.every((step) => step.succeeded));
    assert.equal(outcome.steps.find((step) => step.action === "RETRY")?.queueName, MOCK_TPM_INBOUND_QUEUE);
    resetMockMoves();
  });

  it("refuses to execute a plan that is not executable", async () => {
    resetMockMoves();
    const outcome = await newService().recover(MOCK_TPM_ORPHAN_MESSAGE_ID);
    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(outcome.steps, [], "nothing may be attempted against the tenant");
    resetMockMoves();
  });

  it("throws a 404 for an unknown message id", async () => {
    await assert.rejects(
      () => newService().recover("does-not-exist"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
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
