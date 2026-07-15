import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuntimeEngine } from "../../../src/operations/engines/RuntimeEngine.js";
import { CertificateEngine } from "../../../src/operations/engines/CertificateEngine.js";
import { QueueEngine } from "../../../src/operations/engines/QueueEngine.js";
import { RuntimeClient } from "../../../src/sdk/client/RuntimeClient.js";
import { CertificateClient } from "../../../src/sdk/client/CertificateClient.js";
import { JmsClient } from "../../../src/sdk/client/JmsClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { IRuntimeProvider } from "../../../src/core/providers/IRuntimeProvider.js";
import type { ICertificateProvider } from "../../../src/core/providers/ICertificateProvider.js";
import type { IJmsProvider } from "../../../src/core/providers/IJmsProvider.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";
import type {
  CertificateInfo,
  QueueRuntimeInfo,
  RuntimeArtifactStatus,
} from "../../../src/core/providers/types.js";

describe("operations/engines/RuntimeEngine", () => {
  const artifacts: RuntimeArtifactStatus[] = [
    {
      artifactId: "a1",
      name: "Flow1",
      type: "INTEGRATION_FLOW",
      version: "1.0.0",
      status: "STARTED",
      deployedOn: undefined,
      deployedBy: undefined,
      errorText: undefined,
    },
    {
      artifactId: "a2",
      name: "Flow2",
      type: "INTEGRATION_FLOW",
      version: "1.0.1",
      status: "ERROR",
      deployedOn: undefined,
      deployedBy: undefined,
      errorText: "boom",
    },
  ];
  const provider: IRuntimeProvider = {
    listArtifacts: () => Promise.resolve(artifacts),
    getArtifact: (_context, artifactId) =>
      Promise.resolve(artifacts.find((a) => a.artifactId === artifactId)),
    restartArtifact: () => Promise.resolve(),
  };

  it("listArtifacts enriches with health and human-readable status", async () => {
    const engine = new RuntimeEngine(new RuntimeClient(provider, "primary"), new OperationsCache());
    const summaries = await engine.listArtifacts();
    assert.equal(summaries.find((a) => a.artifactId === "a1")?.health, "healthy");
    assert.equal(summaries.find((a) => a.artifactId === "a2")?.health, "critical");
    assert.equal(summaries.find((a) => a.artifactId === "a1")?.humanReadableStatus, "Started");
    assert.equal(summaries.find((a) => a.artifactId === "a1")?.version, "1.0.0");
  });

  it("getStatusDistribution groups artifacts by raw status", async () => {
    const engine = new RuntimeEngine(new RuntimeClient(provider, "primary"), new OperationsCache());
    const distribution = await engine.getStatusDistribution();
    assert.deepEqual(
      distribution.sort((a, b) => a.value.localeCompare(b.value)),
      [
        { value: "ERROR", count: 1 },
        { value: "STARTED", count: 1 },
      ],
    );
  });

  it("getArtifact returns undefined for an unknown id", async () => {
    const engine = new RuntimeEngine(new RuntimeClient(provider, "primary"), new OperationsCache());
    assert.equal(await engine.getArtifact("missing"), undefined);
  });
});

describe("operations/engines/CertificateEngine", () => {
  const certificates: CertificateInfo[] = [
    {
      alias: "expiring-soon",
      keyType: "RSA",
      owner: undefined,
      issuer: undefined,
      validFrom: "2020-01-01T00:00:00.000Z",
      validTo: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      serialNumber: undefined,
    },
    {
      alias: "far-future",
      keyType: "RSA",
      owner: undefined,
      issuer: undefined,
      validFrom: "2020-01-01T00:00:00.000Z",
      validTo: new Date(Date.now() + 400 * 86_400_000).toISOString(),
      serialNumber: undefined,
    },
  ];
  const provider: ICertificateProvider = {
    listCertificates: () => Promise.resolve(certificates),
    listExpiring: (_context, withinDays) => {
      const horizon = Date.now() + withinDays * 86_400_000;
      return Promise.resolve(certificates.filter((c) => new Date(c.validTo).getTime() <= horizon));
    },
  };

  it("listCertificates enriches with daysRemaining/health", async () => {
    const engine = new CertificateEngine(
      new CertificateClient(provider, "primary"),
      new OperationsCache(),
    );
    const summaries = await engine.listCertificates();
    assert.equal(summaries.find((c) => c.alias === "expiring-soon")?.health, "warning");
    assert.equal(summaries.find((c) => c.alias === "far-future")?.health, "healthy");
  });

  it("search filters by alias substring", async () => {
    const engine = new CertificateEngine(
      new CertificateClient(provider, "primary"),
      new OperationsCache(),
    );
    const found = await engine.search({ alias: "expiring" });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.alias, "expiring-soon");
  });
});

describe("operations/engines/QueueEngine", () => {
  const queueConfigs: QueueConfig[] = [
    {
      name: "Q1",
      displayName: "Queue One",
      description: "",
      deadLetterQueue: "Q1.DLQ",
      retryQueue: "Q1.RETRY",
      priority: 1,
      enabled: true,
      retryStrategy: "manual",
      maxRetries: 0,
    },
    {
      name: "Q2Disabled",
      displayName: "Disabled Queue",
      description: "",
      deadLetterQueue: "Q2.DLQ",
      retryQueue: "Q2.RETRY",
      priority: 2,
      enabled: false,
      retryStrategy: "manual",
      maxRetries: 0,
    },
  ];
  const states: QueueRuntimeInfo[] = [
    { queueName: "Q1", state: "RUNNING", messageCount: 3, consumerCount: 1, capacityUsedPct: 95 },
  ];
  const discovered: QueueRuntimeInfo[] = [
    { queueName: "Q1", state: "RUNNING", messageCount: 3, consumerCount: 1, capacityUsedPct: 95 },
    { queueName: "PIPQ1", state: "RUNNING", messageCount: 0, consumerCount: 0, capacityUsedPct: 0 },
  ];
  const jmsProvider: IJmsProvider = {
    getQueueStates: (_context, queueNames) =>
      Promise.resolve(states.filter((s) => queueNames.includes(s.queueName))),
    discoverQueues: () => Promise.resolve(discovered),
    listMessages: () => Promise.resolve({ items: [], total: 0 }),
    deleteMessage: () => Promise.resolve(),
    purgeQueue: () => Promise.resolve(3),
    retryMessage: () => Promise.resolve(),
    getMessage: () => Promise.resolve(undefined),
  };

  it("listQueues merges live state with static metadata, skipping disabled queues", async () => {
    const engine = new QueueEngine(
      new JmsClient(jmsProvider, "primary"),
      queueConfigs,
      new OperationsCache(),
    );
    const summaries = await engine.listQueues();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.queueName, "Q1");
    assert.equal(summaries[0]?.health, "critical");
    assert.equal(summaries[0]?.deadLetterQueue, "Q1.DLQ");
  });

  it("listQueues in Fetch_All mode discovers every tenant queue, ignoring disabled/unlisted config entries", async () => {
    const engine = new QueueEngine(
      new JmsClient(jmsProvider, "primary"),
      queueConfigs,
      new OperationsCache(),
      "Fetch_All",
    );
    const summaries = await engine.listQueues();
    assert.equal(summaries.length, 2);
    const q1 = summaries.find((s) => s.queueName === "Q1");
    assert.equal(q1?.deadLetterQueue, "Q1.DLQ");
    const unconfigured = summaries.find((s) => s.queueName === "PIPQ1");
    assert.equal(unconfigured?.displayName, "PIPQ1");
    assert.equal(unconfigured?.deadLetterQueue, "");
    assert.equal(unconfigured?.priority, Number.MAX_SAFE_INTEGER);
  });

  it("purgeQueue delegates to the client and returns the removed count", async () => {
    const engine = new QueueEngine(
      new JmsClient(jmsProvider, "primary"),
      queueConfigs,
      new OperationsCache(),
    );
    assert.equal(await engine.purgeQueue("Q1"), 3);
  });
});
