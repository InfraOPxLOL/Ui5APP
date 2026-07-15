import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { RecoveryEngine } from "../../../src/operations/engines/RecoveryEngine.js";
import { RecoveryStateStore } from "../../../src/operations/engines/RecoveryStateStore.js";
import { QueueEngine } from "../../../src/operations/engines/QueueEngine.js";
import { RuntimeEngine } from "../../../src/operations/engines/RuntimeEngine.js";
import { JmsClient } from "../../../src/sdk/client/JmsClient.js";
import { RuntimeClient } from "../../../src/sdk/client/RuntimeClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import { MockEngine } from "../../../src/sdk/mock/MockEngine.js";
import type { IJmsProvider } from "../../../src/core/providers/IJmsProvider.js";
import type { IRuntimeProvider } from "../../../src/core/providers/IRuntimeProvider.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";
import type {
  QueueRuntimeInfo,
  QueuedMessage,
  RuntimeArtifactStatus,
} from "../../../src/core/providers/types.js";

const queueConfigs: QueueConfig[] = [
  {
    name: "ORDERS.IN",
    displayName: "Orders Inbound",
    description: "",
    deadLetterQueue: "ORDERS.DLQ",
    retryQueue: "ORDERS.RETRY",
    priority: 1,
    enabled: true,
    retryStrategy: "manual",
    maxRetries: 0,
  },
  {
    name: "INVOICES.IN",
    displayName: "Invoices Inbound",
    description: "",
    deadLetterQueue: "INVOICES.DLQ",
    retryQueue: "INVOICES.RETRY",
    priority: 2,
    enabled: true,
    retryStrategy: "manual",
    maxRetries: 0,
  },
];

const queueStates: Record<string, QueueRuntimeInfo> = {
  "ORDERS.IN": {
    queueName: "ORDERS.IN",
    state: "RUNNING",
    messageCount: 10,
    consumerCount: 1,
    capacityUsedPct: 20,
  },
  "ORDERS.DLQ": {
    queueName: "ORDERS.DLQ",
    state: "RUNNING",
    messageCount: 3,
    consumerCount: 0,
    capacityUsedPct: 5,
  },
  "ORDERS.RETRY": {
    queueName: "ORDERS.RETRY",
    state: "RUNNING",
    messageCount: 0,
    consumerCount: 0,
    capacityUsedPct: 0,
  },
  "INVOICES.IN": {
    queueName: "INVOICES.IN",
    state: "RUNNING",
    messageCount: 5,
    consumerCount: 0,
    capacityUsedPct: 50,
  },
  "INVOICES.DLQ": {
    queueName: "INVOICES.DLQ",
    state: "RUNNING",
    messageCount: 2,
    consumerCount: 0,
    capacityUsedPct: 10,
  },
  "INVOICES.RETRY": {
    queueName: "INVOICES.RETRY",
    state: "RUNNING",
    messageCount: 0,
    consumerCount: 0,
    capacityUsedPct: 0,
  },
};

const messagesByQueue: Record<string, QueuedMessage[]> = {
  "ORDERS.DLQ": [
    {
      messageId: "m1",
      queueName: "ORDERS.DLQ",
      enqueuedAt: new Date(Date.now() - 7_200_000).toISOString(),
      retryCount: 1,
      sizeBytes: 100,
    },
    {
      messageId: "m2",
      queueName: "ORDERS.DLQ",
      enqueuedAt: new Date(Date.now() - 1_000).toISOString(),
      retryCount: 0,
      sizeBytes: 100,
    },
  ],
  "ORDERS.IN": [
    {
      messageId: "m3",
      queueName: "ORDERS.IN",
      enqueuedAt: new Date(Date.now() - 3_600_000).toISOString(),
      retryCount: 0,
      sizeBytes: 100,
    },
    {
      messageId: "m4",
      queueName: "ORDERS.IN",
      enqueuedAt: new Date(Date.now() - 500).toISOString(),
      retryCount: 0,
      sizeBytes: 100,
    },
  ],
};

/**
 * Stub provider; `retryMessage` resolves through the given mock engine under the same
 * `jms.retryMessage` operation key the real `MockJmsProvider` uses, so per-test
 * `scenarioOverrides` keep controlling retry outcomes.
 */
function buildJmsProvider(mockEngine: MockEngine): IJmsProvider {
  return {
    getQueueStates: (_context, queueNames) =>
      Promise.resolve(
        queueNames
          .map((name) => queueStates[name])
          .filter((s): s is QueueRuntimeInfo => s !== undefined),
      ),
    discoverQueues: () => Promise.resolve(Object.values(queueStates)),
    listMessages: (_context, queueName, page) => {
      const all = messagesByQueue[queueName] ?? [];
      return Promise.resolve({
        items: all.slice(page.skip, page.skip + page.top),
        total: all.length,
      });
    },
    deleteMessage: () => Promise.resolve(),
    purgeQueue: () => Promise.resolve(0),
    retryMessage: async (context, queueName, messageId) => {
      await mockEngine.resolve({
        operationKey: "jms.retryMessage",
        tenantId: context.tenantId,
        generateSuccess: () => ({ queueName, messageId }),
      });
    },
    getMessage: () => Promise.resolve(undefined),
  };
}

const healthyArtifact: RuntimeArtifactStatus = {
  artifactId: "a1",
  name: "Flow1",
  type: "INTEGRATION_FLOW",
  version: "1.0.0",
  status: "STARTED",
  deployedOn: undefined,
  deployedBy: undefined,
  errorText: undefined,
};

const runtimeProvider: IRuntimeProvider = {
  listArtifacts: () => Promise.resolve([healthyArtifact]),
  getArtifact: () => Promise.resolve(healthyArtifact),
  restartArtifact: () => Promise.resolve(),
};

function buildEngine(
  scenarioOverrides: Record<string, "success" | "error"> = {},
  stateStore: RecoveryStateStore = new RecoveryStateStore(),
): RecoveryEngine {
  const mockEngine = new MockEngine({
    enabled: true,
    defaultScenario: "success",
    scenarioOverrides,
  });
  const jmsProvider = buildJmsProvider(mockEngine);
  const queue = new QueueEngine(
    new JmsClient(jmsProvider, "primary"),
    queueConfigs,
    new OperationsCache(),
  );
  const runtime = new RuntimeEngine(
    new RuntimeClient(runtimeProvider, "primary"),
    new OperationsCache(),
  );
  return new RecoveryEngine(
    queue,
    new JmsClient(jmsProvider, "primary"),
    runtime,
    queueConfigs,
    new OperationsCache(),
    stateStore,
  );
}

describe("operations/engines/RecoveryEngine", () => {
  describe("listCandidates", () => {
    it("returns one candidate per non-empty dead-letter/retry queue, sorted by priority", async () => {
      const engine = buildEngine();
      const candidates = await engine.listCandidates();
      assert.deepEqual(
        candidates.map((c) => c.queueName),
        ["ORDERS.DLQ", "INVOICES.DLQ"],
      );
      assert.equal(candidates[0]?.sourceQueue, "ORDERS.IN");
      assert.equal(candidates[0]?.messageCount, 3);
      assert.equal(candidates[0]?.retryStrategy, "manual");
      assert.equal(candidates[0]?.maxRetries, 0);
    });

    it("marks a candidate blocked when its destination queue has no active consumer", async () => {
      const engine = buildEngine();
      const candidates = await engine.listCandidates();
      const invoicesCandidate = candidates.find((c) => c.queueName === "INVOICES.DLQ");
      assert.equal(invoicesCandidate?.readiness, "blocked");
      assert.ok(invoicesCandidate?.blockedReason?.includes("INVOICES.IN"));
      const ordersCandidate = candidates.find((c) => c.queueName === "ORDERS.DLQ");
      assert.equal(ordersCandidate?.readiness, "ready");
    });
  });

  describe("getQueueHealth", () => {
    it("computes a composite health score and defaults growth trend to stable on the first sample", async () => {
      const engine = buildEngine();
      const health = await engine.getQueueHealth();
      const orders = health.find((h) => h.queueName === "ORDERS.IN");
      assert.equal(orders?.consumerStatus, "active");
      assert.equal(orders?.growthTrend, "stable");
      assert.ok((orders?.healthScore ?? 0) > 0);
      assert.equal(orders?.messageCount, 10);
    });

    it("reports oldest and newest parked message age for a queue's own backlog", async () => {
      const engine = buildEngine();
      const health = await engine.getQueueHealth();
      const orders = health.find((h) => h.queueName === "ORDERS.IN");
      assert.ok((orders?.oldestMessageAgeMs ?? 0) > (orders?.newestMessageAgeMs ?? 0));
    });

    it("reports undefined ages for a queue with no parked messages", async () => {
      const engine = buildEngine();
      const health = await engine.getQueueHealth();
      const invoices = health.find((h) => h.queueName === "INVOICES.IN");
      assert.equal(invoices?.oldestMessageAgeMs, undefined);
      assert.equal(invoices?.newestMessageAgeMs, undefined);
    });
  });

  describe("getDlqOverview", () => {
    it("lists one entry per configured dead-letter queue", async () => {
      const engine = buildEngine();
      const overview = await engine.getDlqOverview();
      assert.deepEqual(
        overview.map((e) => e.dlqName),
        ["ORDERS.DLQ", "INVOICES.DLQ"],
      );
      assert.equal(overview[0]?.messageCount, 3);
    });
  });

  describe("validateRecovery", () => {
    it("passes every check for a well-mapped, reachable, consumer-active queue with permission", async () => {
      const engine = buildEngine();
      const result = await engine.validateRecovery("ORDERS.DLQ", true);
      assert.equal(result.passed, true);
      assert.ok(result.checks.every((c) => c.passed));
    });

    it("fails consumerActive/userPermission when the destination has no consumer and the caller lacks permission", async () => {
      const engine = buildEngine();
      const result = await engine.validateRecovery("INVOICES.DLQ", false);
      assert.equal(result.passed, false);
      const consumerCheck = result.checks.find((c) => c.key === "consumerActive");
      const permissionCheck = result.checks.find((c) => c.key === "userPermission");
      assert.equal(consumerCheck?.passed, false);
      assert.equal(permissionCheck?.passed, false);
    });

    it("fails queueMappingExists/targetQueueReachable for a queue with no config mapping", async () => {
      const engine = buildEngine();
      const result = await engine.validateRecovery("UNMAPPED.DLQ", true);
      assert.equal(result.passed, false);
      assert.equal(result.checks.find((c) => c.key === "queueMappingExists")?.passed, false);
      assert.equal(result.checks.find((c) => c.key === "targetQueueReachable")?.passed, false);
    });
  });

  describe("previewRecovery", () => {
    it("composes message count, estimated duration and always requires confirmation", async () => {
      const engine = buildEngine();
      const preview = await engine.previewRecovery("ORDERS.DLQ", true);
      assert.equal(preview.sourceQueue, "ORDERS.DLQ");
      assert.equal(preview.destinationQueue, "ORDERS.IN");
      assert.equal(preview.messageCount, 3);
      assert.equal(preview.confirmationRequired, true);
      assert.ok(preview.estimatedDurationMs > 0);
    });

    it("adds a warning when validation fails", async () => {
      const engine = buildEngine();
      const preview = await engine.previewRecovery("INVOICES.DLQ", false);
      assert.equal(preview.validation.passed, false);
      assert.ok(preview.warnings.some((w) => w.includes("validation checks failed")));
    });
  });

  describe("executeRecovery", () => {
    it("blocks execution and records a failed history entry when validation fails", async () => {
      const stateStore = new RecoveryStateStore();
      const engine = buildEngine({}, stateStore);
      const result = await engine.executeRecovery(
        { sourceQueue: "INVOICES.DLQ", operator: "alice" },
        false,
      );
      assert.equal(result.status, "failed");
      assert.equal(result.messagesRecovered, 0);
      assert.ok(result.result.startsWith("Validation failed"));
      assert.equal(stateStore.findHistory(result.recoveryId)?.status, "failed");
    });

    it("dry-run reports the would-be count without retrying any message", async () => {
      const engine = buildEngine();
      const result = await engine.executeRecovery(
        { sourceQueue: "ORDERS.DLQ", operator: "alice", dryRun: true },
        true,
      );
      assert.equal(result.dryRun, true);
      assert.equal(result.messagesRequested, 2);
      assert.equal(result.messagesRecovered, 0);
    });

    it("recovers every parked message on success", async () => {
      const engine = buildEngine();
      const result = await engine.executeRecovery(
        { sourceQueue: "ORDERS.DLQ", operator: "alice" },
        true,
      );
      assert.equal(result.status, "completed");
      assert.equal(result.messagesRequested, 2);
      assert.equal(result.messagesRecovered, 2);
      assert.equal(result.messagesFailed, 0);
    });

    it("records every message as failed when the retry operation errors", async () => {
      const engine = buildEngine({ "jms.retryMessage": "error" });
      const result = await engine.executeRecovery(
        { sourceQueue: "ORDERS.DLQ", operator: "alice" },
        true,
      );
      assert.equal(result.status, "failed");
      assert.equal(result.messagesRecovered, 0);
      assert.equal(result.messagesFailed, 2);
    });
  });

  describe("cancelRecovery / retryRecovery", () => {
    it("cancelRecovery returns undefined for an unknown or already-finalized recovery", async () => {
      const engine = buildEngine();
      assert.equal(engine.cancelRecovery("does-not-exist"), undefined);
      const completed = await engine.executeRecovery(
        { sourceQueue: "ORDERS.DLQ", operator: "alice", dryRun: true },
        true,
      );
      assert.equal(engine.cancelRecovery(completed.recoveryId), undefined);
    });

    it("retryRecovery re-runs a prior recovery's source queue as a new attempt", async () => {
      const engine = buildEngine();
      const original = await engine.executeRecovery(
        { sourceQueue: "ORDERS.DLQ", operator: "alice", dryRun: true },
        true,
      );
      const retried = await engine.retryRecovery(original.recoveryId, true);
      assert.ok(retried !== undefined);
      assert.notEqual(retried?.recoveryId, original.recoveryId);
      assert.equal(retried?.sourceQueue, "ORDERS.DLQ");
    });

    it("retryRecovery returns undefined for an unknown recovery id", async () => {
      const engine = buildEngine();
      assert.equal(await engine.retryRecovery("does-not-exist", true), undefined);
    });
  });

  describe("getHistory / getStatistics", () => {
    let stateStore: RecoveryStateStore;
    let engine: RecoveryEngine;

    beforeEach(async () => {
      stateStore = new RecoveryStateStore();
      engine = buildEngine({}, stateStore);
      await engine.executeRecovery({ sourceQueue: "ORDERS.DLQ", operator: "alice" }, true);
      await engine.executeRecovery({ sourceQueue: "INVOICES.DLQ", operator: "bob" }, false);
    });

    it("getHistory lists entries most recent first with paging", () => {
      const page = engine.getHistory({ skip: 0, top: 1 });
      assert.equal(page.total, 2);
      assert.equal(page.items.length, 1);
      assert.equal(page.items[0]?.operator, "bob");
    });

    it("getStatistics aggregates success/failure counts across history", async () => {
      const stats = await engine.getStatistics();
      assert.equal(stats.totalRecoveries, 2);
      assert.equal(stats.successfulRecoveries, 1);
      assert.equal(stats.failedRecoveries, 1);
      assert.equal(stats.successRatePct, 50);
    });
  });

  describe("getDashboard", () => {
    it("composes candidates, queue health, DLQ overview, statistics and recent recoveries in one call", async () => {
      const engine = buildEngine();
      const dashboard = await engine.getDashboard();
      assert.ok(dashboard.candidates.length > 0);
      assert.ok(dashboard.queueHealth.length > 0);
      assert.ok(dashboard.dlqOverview.length > 0);
      assert.equal(typeof dashboard.statistics.totalRecoveries, "number");
      assert.deepEqual(dashboard.recentRecoveries, []);
    });
  });
});
