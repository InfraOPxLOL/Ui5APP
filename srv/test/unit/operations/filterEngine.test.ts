import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FilterEngine } from "../../../src/operations/engines/FilterEngine.js";
import type { MessageSummary } from "../../../src/operations/dto/MessageDto.js";
import type { CertificateSummary } from "../../../src/operations/dto/CertificateDto.js";
import type { QueueSummary } from "../../../src/operations/dto/QueueDto.js";
import type { RuntimeSummary } from "../../../src/operations/dto/RuntimeDto.js";

function messageFixture(overrides: Partial<MessageSummary>): MessageSummary {
  return {
    messageId: "m1",
    correlationId: "c1",
    integrationFlow: "IF1",
    status: "COMPLETED",
    humanReadableStatus: "Completed",
    severity: "info",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: undefined,
    processingTimeMs: undefined,
    processingTimeHuman: "In progress",
    sender: "S1",
    receiver: "R1",
    applicationId: undefined,
    messageType: undefined,
    customStatus: undefined,
    ...overrides,
  };
}

function certificateFixture(overrides: Partial<CertificateSummary>): CertificateSummary {
  return {
    alias: "cert",
    keyType: "RSA",
    owner: undefined,
    issuer: undefined,
    validFrom: "2020-01-01T00:00:00.000Z",
    validTo: "2030-01-01T00:00:00.000Z",
    serialNumber: undefined,
    daysRemaining: 3650,
    health: "healthy",
    ...overrides,
  };
}

function queueFixture(overrides: Partial<QueueSummary>): QueueSummary {
  return {
    queueName: "Q",
    displayName: "Q",
    description: "",
    state: "RUNNING",
    messageCount: 0,
    consumerCount: 1,
    capacityUsedPct: 10,
    utilization: 10,
    health: "healthy",
    deadLetterQueue: "Q.DLQ",
    retryQueue: "Q.RETRY",
    priority: 1,
    retryStrategy: "manual",
    maxRetries: 0,
    ...overrides,
  };
}

function runtimeFixture(overrides: Partial<RuntimeSummary>): RuntimeSummary {
  return {
    artifactId: "art1",
    name: "Flow",
    type: "INTEGRATION_FLOW",
    version: "1.0.0",
    status: "STARTED",
    humanReadableStatus: "Started",
    health: "healthy",
    deployedOn: undefined,
    deployedBy: undefined,
    errorText: undefined,
    ...overrides,
  };
}

interface Widget {
  readonly name: string;
  readonly color: string;
  readonly size: number;
}

const widgets: Widget[] = [
  { name: "a", color: "red", size: 10 },
  { name: "b", color: "blue", size: 20 },
  { name: "c", color: "red", size: 30 },
];

describe("operations/engines/FilterEngine (generic core)", () => {
  it("applies only the criteria present, ignoring undefined values", () => {
    const engine = new FilterEngine<Widget>().register(
      "color",
      (value, item) => item.color === value,
    );
    const result = engine.apply(widgets, { color: "red", size: undefined });
    assert.deepEqual(
      result.map((w) => w.name),
      ["a", "c"],
    );
  });

  it("returns every item unchanged when no criteria are present", () => {
    const engine = new FilterEngine<Widget>().register(
      "color",
      (value, item) => item.color === value,
    );
    assert.equal(engine.apply(widgets, {}).length, 3);
  });

  it("ignores an unregistered criterion name (fails open, not closed)", () => {
    const engine = new FilterEngine<Widget>();
    assert.equal(engine.apply(widgets, { unknownField: "x" }).length, 3);
  });

  it("register() is chainable and supports registering new filters without touching existing ones", () => {
    const engine = new FilterEngine<Widget>()
      .register("color", (value, item) => item.color === value)
      .register("minSize", (value, item) => item.size >= (value as number));
    const result = engine.apply(widgets, { color: "red", minSize: 15 });
    assert.deepEqual(
      result.map((w) => w.name),
      ["c"],
    );
  });
});

describe("operations/engines/FilterEngine static factories", () => {
  it("forMessages filters by status/messageType/duration range", () => {
    const messages = [
      messageFixture({ status: "FAILED", messageType: "ORDERS", processingTimeMs: 500 }),
      messageFixture({ status: "COMPLETED", messageType: "INVOIC", processingTimeMs: 5000 }),
    ];
    const engine = FilterEngine.forMessages();
    assert.equal(engine.apply(messages, { status: "FAILED" }).length, 1);
    assert.equal(engine.apply(messages, { messageType: "INVOIC" }).length, 1);
    assert.equal(engine.apply(messages, { durationMinMs: 1000 }).length, 1);
    assert.equal(engine.apply(messages, { durationMaxMs: 1000 }).length, 1);
  });

  it("forCertificates filters by alias substring and expiry horizon", () => {
    const certificates = [
      certificateFixture({ alias: "primary-cert", daysRemaining: 5 }),
      certificateFixture({ alias: "backup-cert", daysRemaining: 200 }),
    ];
    const engine = FilterEngine.forCertificates();
    assert.equal(engine.apply(certificates, { certificate: "primary" }).length, 1);
    assert.equal(engine.apply(certificates, { certificateExpiryWithinDays: 30 }).length, 1);
  });

  it("forQueues filters by queue name and health", () => {
    const queues = [
      queueFixture({ queueName: "Q1", health: "critical" }),
      queueFixture({ queueName: "Q2", health: "healthy" }),
    ];
    const engine = FilterEngine.forQueues();
    assert.equal(engine.apply(queues, { queue: "Q1" }).length, 1);
    assert.equal(engine.apply(queues, { health: "critical" }).length, 1);
  });

  it("forRuntime filters by runtime status and health", () => {
    const artifacts = [
      runtimeFixture({ status: "STARTED", health: "healthy" }),
      runtimeFixture({ status: "ERROR", health: "critical" }),
    ];
    const engine = FilterEngine.forRuntime();
    assert.equal(engine.apply(artifacts, { runtimeStatus: "ERROR" }).length, 1);
    assert.equal(engine.apply(artifacts, { health: "healthy" }).length, 1);
  });
});
