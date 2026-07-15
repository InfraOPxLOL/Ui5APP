import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OperationsService } from "../../../src/modules/operations/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import type { QueueConfig } from "../../../src/config/schemas/index.js";
import type { HealthStatus, Severity } from "../../../src/operations/transform/index.js";

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

const HEALTHS: readonly HealthStatus[] = ["healthy", "warning", "critical"];
const SEVERITIES: readonly Severity[] = ["info", "warning", "error", "critical"];

function newService(): OperationsService {
  return new OperationsService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: QUEUE_CONFIGS });
  });
}

/**
 * Mirrors a real, observed production failure: a tenant whose Integration Suite plan doesn't
 * implement the JmsQueues API at all (`jms.discoverQueues` responds "Not Implemented"/501) while
 * every other domain (messages, runtime, certificates) succeeds normally.
 */
function newServiceWithQueueDiscoveryFailure(): OperationsService {
  return new OperationsService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: {
        enabled: true,
        defaultScenario: "success",
        scenarioOverrides: { "jms.discoverQueues": "error" },
      },
    });
    return new OperationsEngine({
      sdk,
      queueConfigs: QUEUE_CONFIGS,
      queueDiscoveryMode: "Fetch_All",
    });
  });
}

describe("modules/operations/OperationsService.getOverview", () => {
  it("composes a well-formed overview from the Operations Engine (mock mode)", async () => {
    const overview = await newService().getOverview();

    assert.equal(overview.window.hours, 24, "default window is 24h");
    assert.ok(overview.window.from < overview.window.to, "window is ordered");
    assert.ok(typeof overview.generatedAt === "string" && overview.generatedAt.length > 0);
  });

  it("emits the six health widgets in canonical order, each with valid health/severity", async () => {
    const overview = await newService().getOverview();
    assert.deepEqual(
      overview.health.map((w) => w.id),
      ["tenant", "runtime", "deployment", "queue", "certificate", "alert"],
    );
    for (const widget of overview.health) {
      assert.ok(HEALTHS.includes(widget.health), `${widget.id} health`);
      assert.ok(SEVERITIES.includes(widget.severity), `${widget.id} severity`);
      assert.ok(widget.total >= 0 && widget.value >= 0);
      assert.ok(widget.titleKey.startsWith("ops.health."));
    }
  });

  it("surfaces statistics, interfaces, failures, quick insights and a bounded timeline", async () => {
    const overview = await newService().getOverview();

    assert.ok(typeof overview.statistics.totalMessages === "number");
    assert.deepEqual(Object.keys(overview.runtimeHealthCounts).sort(), [
      "critical",
      "healthy",
      "warning",
    ]);

    assert.ok(overview.topInterfaces.length <= 8);
    for (const iface of overview.topInterfaces) {
      assert.ok(HEALTHS.includes(iface.health));
      assert.ok(iface.messageCount >= iface.failures, "failures cannot exceed message count");
      assert.ok(iface.messageCount >= iface.warnings, "warnings cannot exceed message count");
      assert.equal(typeof iface.averageRuntimeHuman, "string");
    }

    for (const failure of overview.recentFailures) {
      assert.ok(failure.severity === "error" || failure.severity === "critical");
    }

    assert.equal(overview.quickInsights.length, 4);
    for (const insight of overview.quickInsights) {
      assert.ok(SEVERITIES.includes(insight.severity));
      assert.ok(insight.labelKey.startsWith("ops.insight."));
    }

    assert.ok(overview.timeline.length <= 25);
    for (let i = 1; i < overview.timeline.length; i += 1) {
      assert.ok(
        overview.timeline[i - 1]!.timestamp >= overview.timeline[i]!.timestamp,
        "timeline is newest-first",
      );
    }
  });

  it("honours a custom window", async () => {
    const overview = await newService().getOverview(6);
    assert.equal(overview.window.hours, 6);
  });

  it("degrades only the queue dimension when jms.discoverQueues fails, keeping every other domain intact", async () => {
    const overview = await newServiceWithQueueDiscoveryFailure().getOverview();

    const queueWidget = overview.health.find((w) => w.id === "queue");
    assert.ok(queueWidget !== undefined);
    assert.equal(
      queueWidget.health,
      "healthy",
      "an unavailable domain reports neutral, not fabricated, health",
    );
    assert.equal(queueWidget.total, 0);

    assert.ok(overview.statistics.totalMessages >= 0, "statistics still compose normally");
    assert.equal(overview.quickInsights.length, 4, "quick insights still compose normally");
    assert.ok(
      overview.health.some((w) => w.id === "certificate"),
      "the certificate dimension is unaffected by the queue failure",
    );
  });
});

describe("modules/operations/OperationsService.search", () => {
  it("returns aggregated matches across domains", async () => {
    const result = await newService().search("a");
    assert.equal(result.query, "a");
    assert.ok(Array.isArray(result.messages));
    assert.ok(Array.isArray(result.queues));
    assert.ok(Array.isArray(result.certificates));
    assert.ok(Array.isArray(result.runtimeArtifacts));
    assert.equal(
      result.totalHits,
      result.messages.length +
        result.queues.length +
        result.certificates.length +
        result.runtimeArtifacts.length,
    );
    assert.ok(result.tookMs >= 0);
  });

  it("short-circuits an empty query to zero hits", async () => {
    const result = await newService().search("   ");
    assert.equal(result.totalHits, 0);
    assert.equal(result.messages.length, 0);
  });

  it("degrades only queue matches when jms.discoverQueues fails, keeping other domains searchable", async () => {
    const result = await newServiceWithQueueDiscoveryFailure().search("a");
    assert.equal(result.queues.length, 0);
    assert.ok(Array.isArray(result.messages));
    assert.ok(Array.isArray(result.certificates));
    assert.ok(Array.isArray(result.runtimeArtifacts));
  });
});
