import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StatisticsEngine } from "../../../src/operations/engines/StatisticsEngine.js";
import { SearchEngine } from "../../../src/operations/engines/SearchEngine.js";
import { MessageEngine } from "../../../src/operations/engines/MessageEngine.js";
import { RuntimeEngine } from "../../../src/operations/engines/RuntimeEngine.js";
import { QueueEngine } from "../../../src/operations/engines/QueueEngine.js";
import { CertificateEngine } from "../../../src/operations/engines/CertificateEngine.js";
import { MonitoringClient } from "../../../src/sdk/client/MonitoringClient.js";
import { RuntimeClient } from "../../../src/sdk/client/RuntimeClient.js";
import { JmsClient } from "../../../src/sdk/client/JmsClient.js";
import { CertificateClient } from "../../../src/sdk/client/CertificateClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { IMonitoringProvider } from "../../../src/core/providers/IMonitoringProvider.js";
import type { IRuntimeProvider } from "../../../src/core/providers/IRuntimeProvider.js";
import type { IJmsProvider } from "../../../src/core/providers/IJmsProvider.js";
import type { ICertificateProvider } from "../../../src/core/providers/ICertificateProvider.js";
import type {
  MessageProcessingLog,
  RuntimeArtifactStatus,
} from "../../../src/core/providers/types.js";

const LOGS: MessageProcessingLog[] = [
  {
    messageId: "m1",
    correlationId: "c1",
    integrationFlow: "IF1",
    status: "FAILED",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:01.000Z",
    processingTimeMs: 1000,
    sender: "S1",
    receiver: "R1",
    customStatus: undefined,
    applicationId: "APP1",
    messageType: "ORDERS",
  },
  {
    messageId: "m2",
    correlationId: "c2",
    integrationFlow: "IF2",
    status: "COMPLETED",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:03.000Z",
    processingTimeMs: 3000,
    sender: "S1",
    receiver: "R2",
    customStatus: undefined,
    applicationId: "APP1",
    messageType: "INVOIC",
  },
  {
    messageId: "m3",
    correlationId: "c3",
    integrationFlow: "IF1",
    status: "COMPLETED",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:05.000Z",
    processingTimeMs: 5000,
    sender: "S2",
    receiver: "R1",
    customStatus: undefined,
    applicationId: "APP2",
    messageType: "ORDERS",
  },
];

const monitoringProvider: IMonitoringProvider = {
  queryMessageLogs: (_context, filter, page) => {
    const filtered = LOGS.filter(
      (log) => filter.status === undefined || log.status === filter.status,
    );
    return Promise.resolve({
      items: filtered.slice(page.skip, page.skip + page.top),
      total: filtered.length,
    });
  },
  getMessageLog: () => Promise.resolve(undefined),
  getErrorDetails: () => Promise.resolve([]),
  countByStatus: () => Promise.resolve({}),
  getCustomHeaders: () => Promise.resolve([]),
};

const artifacts: RuntimeArtifactStatus[] = [
  {
    artifactId: "a1",
    name: "F1",
    type: "INTEGRATION_FLOW",
    version: "1.0.0",
    status: "STARTED",
    deployedOn: undefined,
    deployedBy: undefined,
    errorText: undefined,
  },
  {
    artifactId: "a2",
    name: "F2",
    type: "INTEGRATION_FLOW",
    version: "1.0.1",
    status: "ERROR",
    deployedOn: undefined,
    deployedBy: undefined,
    errorText: undefined,
  },
];
const runtimeProvider: IRuntimeProvider = {
  listArtifacts: () => Promise.resolve(artifacts),
  getArtifact: () => Promise.resolve(undefined),
  restartArtifact: () => Promise.resolve(),
};

describe("operations/engines/StatisticsEngine", () => {
  it("computes counts, duration stats, top-N and distributions", async () => {
    const runtimeEngine = new RuntimeEngine(
      new RuntimeClient(runtimeProvider, "primary"),
      new OperationsCache(),
    );
    const engine = new StatisticsEngine(
      new MonitoringClient(monitoringProvider, "primary"),
      runtimeEngine,
      new OperationsCache(),
    );
    const stats = await engine.getStatistics(
      "2024-01-01T00:00:00.000Z",
      "2024-01-02T00:00:00.000Z",
    );

    assert.equal(stats.totalMessages, 3);
    assert.equal(stats.failedCount, 1);
    assert.equal(stats.completedCount, 2);
    assert.equal(stats.averageProcessingTimeMs, 3000);
    assert.equal(stats.maxProcessingTimeMs, 5000);
    assert.equal(stats.minProcessingTimeMs, 1000);
    assert.deepEqual(stats.topSenders[0], { key: "S1", count: 2 });
    assert.deepEqual(stats.topApplications[0], { key: "APP1", count: 2 });
    assert.equal(stats.runtimeStatusDistribution.length, 2);
  });
});

describe("operations/engines/SearchEngine", () => {
  const queueProvider: IJmsProvider = {
    getQueueStates: (_context, queueNames) =>
      Promise.resolve(
        queueNames.map((name) => ({
          queueName: name,
          state: "RUNNING",
          messageCount: 0,
          consumerCount: 1,
          capacityUsedPct: 5,
        })),
      ),
    discoverQueues: () => Promise.resolve([]),
    listMessages: () => Promise.resolve({ items: [], total: 0 }),
    deleteMessage: () => Promise.resolve(),
    purgeQueue: () => Promise.resolve(0),
    retryMessage: () => Promise.resolve(),
    getMessage: () => Promise.resolve(undefined),
  };
  const certificateProvider: ICertificateProvider = {
    listCertificates: () =>
      Promise.resolve([
        {
          alias: "order-cert",
          keyType: "RSA",
          owner: undefined,
          issuer: undefined,
          validFrom: "2020-01-01T00:00:00.000Z",
          validTo: "2030-01-01T00:00:00.000Z",
          serialNumber: undefined,
        },
      ]),
    listExpiring: () => Promise.resolve([]),
  };

  function newSearchEngine(): SearchEngine {
    const cache = new OperationsCache();
    const messageEngine = new MessageEngine(
      new MonitoringClient(monitoringProvider, "primary"),
      cache,
    );
    const queueEngine = new QueueEngine(
      new JmsClient(queueProvider, "primary"),
      [
        {
          name: "ORDERS_Q",
          displayName: "Orders Queue",
          description: "",
          deadLetterQueue: "ORDERS_Q.DLQ",
          retryQueue: "ORDERS_Q.RETRY",
          priority: 1,
          enabled: true,
          retryStrategy: "manual",
          maxRetries: 0,
        },
      ],
      cache,
    );
    const certificateEngine = new CertificateEngine(
      new CertificateClient(certificateProvider, "primary"),
      cache,
    );
    return new SearchEngine(messageEngine, queueEngine, certificateEngine);
  }

  it("searchMessages delegates to MessageEngine.queryMessages", async () => {
    const engine = newSearchEngine();
    const result = await engine.searchMessages({
      page: 1,
      pageSize: 10,
      sortDirection: "desc",
      includePayload: false,
      includeAttachments: false,
      includeHeaders: false,
      status: "FAILED",
    });
    assert.equal(result.total, 1);
  });

  it("findMessagesByCorrelationId finds matching messages", async () => {
    const engine = newSearchEngine();
    const found = await engine.findMessagesByCorrelationId("c2");
    assert.equal(found.length, 1);
    assert.equal(found[0]?.messageId, "m2");
  });

  it("searchQueues matches by name/display-name substring", async () => {
    const engine = newSearchEngine();
    const found = await engine.searchQueues("orders");
    assert.equal(found.length, 1);
  });

  it("searchCertificates matches by alias substring", async () => {
    const engine = newSearchEngine();
    const found = await engine.searchCertificates("order");
    assert.equal(found.length, 1);
  });
});
