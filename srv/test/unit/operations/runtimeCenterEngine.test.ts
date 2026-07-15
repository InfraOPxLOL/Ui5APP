import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuntimeCenterEngine } from "../../../src/operations/engines/RuntimeCenterEngine.js";
import { RuntimeCenterStateStore } from "../../../src/operations/engines/RuntimeCenterStateStore.js";
import { RuntimeEngine } from "../../../src/operations/engines/RuntimeEngine.js";
import { MessageEngine } from "../../../src/operations/engines/MessageEngine.js";
import { QueueEngine } from "../../../src/operations/engines/QueueEngine.js";
import { CertificateEngine } from "../../../src/operations/engines/CertificateEngine.js";
import { NotificationEngine } from "../../../src/operations/engines/NotificationEngine.js";
import { RuntimeClient } from "../../../src/sdk/client/RuntimeClient.js";
import { MonitoringClient } from "../../../src/sdk/client/MonitoringClient.js";
import { JmsClient } from "../../../src/sdk/client/JmsClient.js";
import { CertificateClient } from "../../../src/sdk/client/CertificateClient.js";
import { AlertNotificationClient } from "../../../src/sdk/client/AlertNotificationClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { IRuntimeProvider } from "../../../src/core/providers/IRuntimeProvider.js";
import type { IMonitoringProvider } from "../../../src/core/providers/IMonitoringProvider.js";
import type { IJmsProvider } from "../../../src/core/providers/IJmsProvider.js";
import type { ICertificateProvider } from "../../../src/core/providers/ICertificateProvider.js";
import type { IAlertProvider } from "../../../src/core/providers/IAlertProvider.js";
import type {
  AlertEvent,
  CertificateInfo,
  MessageProcessingLog,
  RuntimeArtifactStatus,
} from "../../../src/core/providers/types.js";

const artifacts: RuntimeArtifactStatus[] = [
  {
    artifactId: "a1",
    name: "OrderFlow",
    type: "IntegrationFlow",
    version: "2.0.0",
    status: "STARTED",
    deployedOn: "2026-01-01T00:00:00.000Z",
    deployedBy: "P123456",
    errorText: undefined,
  },
  {
    artifactId: "a2",
    name: "InvoiceFlow",
    type: "IntegrationFlow",
    version: "1.0.0",
    status: "ERROR",
    deployedOn: "2026-01-02T00:00:00.000Z",
    deployedBy: "P234567",
    errorText: "boom",
  },
  {
    artifactId: "a3",
    name: "ValueMappingXYZ",
    type: "ValueMappingDesigntimeArtifact",
    version: "1.0.0",
    status: "STARTED",
    deployedOn: undefined,
    deployedBy: undefined,
    errorText: undefined,
  },
];

const now = Date.now();
const allMessages: MessageProcessingLog[] = [
  {
    messageId: "m1",
    correlationId: "c1",
    integrationFlow: "OrderFlow",
    status: "COMPLETED",
    startTime: new Date(now - 3000).toISOString(),
    endTime: new Date(now - 2900).toISOString(),
    processingTimeMs: 100,
    sender: "S1",
    receiver: "R1",
    customStatus: undefined,
    applicationId: undefined,
    messageType: undefined,
  },
  {
    messageId: "m2",
    correlationId: "c2",
    integrationFlow: "OrderFlow",
    status: "COMPLETED",
    startTime: new Date(now - 2000).toISOString(),
    endTime: new Date(now - 1900).toISOString(),
    processingTimeMs: 200,
    sender: "S1",
    receiver: "R2",
    customStatus: undefined,
    applicationId: undefined,
    messageType: undefined,
  },
  {
    messageId: "m3",
    correlationId: "c3",
    integrationFlow: "OrderFlow",
    status: "COMPLETED",
    startTime: new Date(now - 1000).toISOString(),
    endTime: new Date(now - 900).toISOString(),
    processingTimeMs: 300,
    sender: "S2",
    receiver: "R1",
    customStatus: undefined,
    applicationId: undefined,
    messageType: undefined,
  },
  {
    messageId: "m4",
    correlationId: "c4",
    integrationFlow: "OrderFlow",
    status: "FAILED",
    startTime: new Date(now - 500).toISOString(),
    endTime: new Date(now - 400).toISOString(),
    processingTimeMs: 50,
    sender: "S1",
    receiver: "R1",
    customStatus: undefined,
    applicationId: undefined,
    messageType: undefined,
  },
];

const runtimeProvider: IRuntimeProvider = {
  listArtifacts: () => Promise.resolve(artifacts),
  getArtifact: (_context, artifactId) =>
    Promise.resolve(artifacts.find((a) => a.artifactId === artifactId)),
  // Mirrors MockRuntimeProvider's own permissive behavior (no existence check — always succeeds),
  // as distinct from RealRuntimeProvider's HttpError.notFound. RuntimeCenterEngine.redeploy documents
  // this exact asymmetry: it re-fetches after restarting and returns `undefined` when the artifact
  // still doesn't resolve, rather than assuming every provider validates existence up front.
  restartArtifact: () => Promise.resolve(),
};

const monitoringProvider: IMonitoringProvider = {
  queryMessageLogs: (_context, filter, page) => {
    let items = allMessages;
    if (filter.integrationFlow !== undefined) {
      items = items.filter((m) => m.integrationFlow === filter.integrationFlow);
    }
    if (filter.from !== undefined) {
      items = items.filter((m) => m.startTime >= filter.from!);
    }
    if (filter.to !== undefined) {
      items = items.filter((m) => m.startTime <= filter.to!);
    }
    return Promise.resolve({
      items: items.slice(page.skip, page.skip + page.top),
      total: items.length,
    });
  },
  getMessageLog: () => Promise.resolve(undefined),
  getErrorDetails: () => Promise.resolve([]),
  countByStatus: () => Promise.resolve({}),
  getCustomHeaders: () => Promise.resolve([]),
};

const jmsProvider: IJmsProvider = {
  getQueueStates: () => Promise.resolve([]),
  discoverQueues: () => Promise.resolve([]),
  listMessages: () => Promise.resolve({ items: [], total: 0 }),
  deleteMessage: () => Promise.resolve(),
  purgeQueue: () => Promise.resolve(0),
  retryMessage: () => Promise.resolve(),
  getMessage: () => Promise.resolve(undefined),
};

const certificates: CertificateInfo[] = [
  {
    alias: "expiring-soon",
    keyType: "RSA",
    owner: undefined,
    issuer: undefined,
    validFrom: "2020-01-01T00:00:00.000Z",
    validTo: new Date(now + 5 * 86_400_000).toISOString(),
    serialNumber: undefined,
  },
];

const certificateProvider: ICertificateProvider = {
  listCertificates: () => Promise.resolve(certificates),
  listExpiring: (_context, withinDays) => {
    const horizon = now + withinDays * 86_400_000;
    return Promise.resolve(certificates.filter((c) => new Date(c.validTo).getTime() <= horizon));
  },
};

const alerts: AlertEvent[] = [
  {
    alertId: "alert-1",
    severity: "ERROR",
    title: "Runtime artifact error",
    description: "Integration flow OrderFlow failed to (re)start.",
    source: "runtime",
    raisedAt: new Date(now - 60_000).toISOString(),
    tags: ["runtime"],
  },
  {
    alertId: "alert-2",
    severity: "INFO",
    title: "Unrelated notice",
    description: "Nothing to do with any flow here.",
    source: "misc",
    raisedAt: new Date(now - 30_000).toISOString(),
    tags: [],
  },
];

const alertProvider: IAlertProvider = {
  queryAlerts: (_context, page) =>
    Promise.resolve({ items: alerts.slice(page.skip, page.skip + page.top), total: alerts.length }),
  getAlert: (_context, alertId) => Promise.resolve(alerts.find((a) => a.alertId === alertId)),
};

function buildEngine(
  stateStore: RuntimeCenterStateStore = new RuntimeCenterStateStore(),
): RuntimeCenterEngine {
  const cache = new OperationsCache();
  const runtime = new RuntimeEngine(new RuntimeClient(runtimeProvider, "primary"), cache);
  const message = new MessageEngine(new MonitoringClient(monitoringProvider, "primary"), cache);
  const queue = new QueueEngine(new JmsClient(jmsProvider, "primary"), [], cache);
  const certificate = new CertificateEngine(
    new CertificateClient(certificateProvider, "primary"),
    cache,
  );
  const notification = new NotificationEngine(
    new AlertNotificationClient(alertProvider, "primary"),
    cache,
  );
  return new RuntimeCenterEngine(
    runtime,
    message,
    queue,
    certificate,
    notification,
    cache,
    stateStore,
  );
}

describe("operations/engines/RuntimeCenterEngine", () => {
  describe("listCatalog", () => {
    it("lists only flow-type artifacts, enriched with message stats and deployment count", async () => {
      const engine = buildEngine();
      const catalog = await engine.listCatalog();
      assert.deepEqual(catalog.map((c) => c.artifactId).sort(), ["a1", "a2"]);
      const orderFlow = catalog.find((c) => c.artifactId === "a1");
      assert.equal(orderFlow?.recentMessageCount, 4);
      assert.equal(orderFlow?.successRatePct, 75);
      assert.equal(orderFlow?.version, "2.0.0");
      assert.equal(orderFlow?.deploymentCount, 1);
    });

    it("reports zero messages/success rate for a flow with no recent messages", async () => {
      const engine = buildEngine();
      const catalog = await engine.listCatalog();
      const invoiceFlow = catalog.find((c) => c.artifactId === "a2");
      assert.equal(invoiceFlow?.recentMessageCount, 0);
      assert.equal(invoiceFlow?.successRatePct, 0);
    });
  });

  describe("getDetails", () => {
    it("composes recent messages, sender/receiver systems and tenant-wide context", async () => {
      const engine = buildEngine();
      const details = await engine.getDetails("a1");
      assert.ok(details !== undefined);
      assert.equal(details?.recentMessages.length, 4);
      assert.deepEqual([...details!.senderSystems].sort(), ["S1", "S2"]);
      assert.deepEqual([...details!.receiverSystems].sort(), ["R1", "R2"]);
      assert.equal(details?.certificateWatch.length, 1);
      assert.deepEqual(details?.dependencies, []);
      assert.equal(details?.activeAlerts.length, 1);
      assert.equal(details?.activeAlerts[0]?.notificationId, "alert-1");
    });

    it("returns undefined for an unknown artifact id", async () => {
      const engine = buildEngine();
      assert.equal(await engine.getDetails("does-not-exist"), undefined);
    });
  });

  describe("getHealth", () => {
    it("computes success rate, average runtime and matches active alerts by name", async () => {
      const engine = buildEngine();
      const health = await engine.getHealth("a1");
      assert.equal(health?.successRatePct, 75);
      assert.equal(health?.averageRuntimeMs, 163);
      assert.equal(health?.activeAlerts.length, 1);
      assert.ok((health?.healthScore ?? 0) > 0);
    });

    it("defaults failure trend to stable on the first sample", async () => {
      const engine = buildEngine();
      const health = await engine.getHealth("a1");
      assert.equal(health?.failureTrend, "stable");
    });

    it("returns undefined for an unknown artifact id", async () => {
      const engine = buildEngine();
      assert.equal(await engine.getHealth("does-not-exist"), undefined);
    });
  });

  describe("getDeploymentTimeline / redeploy", () => {
    it("seeds the timeline from the artifact's current state on first access", async () => {
      const engine = buildEngine();
      const timeline = await engine.getDeploymentTimeline("a1");
      assert.equal(timeline?.length, 1);
      assert.equal(timeline?.[0]?.kind, "deployed");
      assert.equal(timeline?.[0]?.version, "2.0.0");
    });

    it("returns undefined for an unknown artifact id", async () => {
      const engine = buildEngine();
      assert.equal(await engine.getDeploymentTimeline("does-not-exist"), undefined);
    });

    it("redeploy appends a redeployed event and is reflected in the timeline", async () => {
      const stateStore = new RuntimeCenterStateStore();
      const engine = buildEngine(stateStore);
      const event = await engine.redeploy("a1", "alice");
      assert.equal(event?.kind, "redeployed");
      assert.equal(event?.actor, "alice");
      const timeline = await engine.getDeploymentTimeline("a1");
      assert.equal(timeline?.length, 2);
      assert.equal(timeline?.[1]?.kind, "redeployed");
    });

    it("redeploy returns undefined when the artifact is unknown", async () => {
      const engine = buildEngine();
      assert.equal(await engine.redeploy("does-not-exist", "alice"), undefined);
    });
  });
});
