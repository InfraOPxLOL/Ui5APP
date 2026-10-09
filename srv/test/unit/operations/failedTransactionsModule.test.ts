import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { FailedTransactionsService } from "../../../src/modules/failed-transactions/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import { frameworksSchema, type FrameworkConfig } from "../../../src/config/schemas/index.js";
import type { MockEngineConfig } from "../../../src/sdk/mock/MockTypes.js";
import { recoveryLockStore } from "../../../src/operations/recovery/RecoveryLockStore.js";
import {
  MOCK_TPM_INBOUND_QUEUE,
  MOCK_TPM_OUTBOUND_QUEUE,
  MOCK_TPM_PROCESSING_DLQ,
  MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
  MOCK_TPM_RECEIVER_DLQ,
  MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
  TPM_DLQ_SCENARIOS,
  resetMockMoves,
} from "../../../src/sdk/mock/fixtures/index.js";

const FRAMEWORK_CONFIGS: readonly FrameworkConfig[] = frameworksSchema.parse({
  frameworks: [
    {
      id: "TPM_V2",
      label: "TPM V2",
      priority: 1,
      detect: { integrationFlowPatterns: ["^SAP_TPM_"] },
      topology: {
        traversalOrder: [
          MOCK_TPM_INBOUND_QUEUE,
          MOCK_TPM_OUTBOUND_QUEUE,
          MOCK_TPM_PROCESSING_DLQ,
          MOCK_TPM_RECEIVER_DLQ,
        ],
        activeQueues: [MOCK_TPM_INBOUND_QUEUE, MOCK_TPM_OUTBOUND_QUEUE],
        deadLetterQueues: [MOCK_TPM_PROCESSING_DLQ, MOCK_TPM_RECEIVER_DLQ],
        dlqRecoveryMap: {
          [MOCK_TPM_PROCESSING_DLQ]: MOCK_TPM_INBOUND_QUEUE,
          [MOCK_TPM_RECEIVER_DLQ]: MOCK_TPM_OUTBOUND_QUEUE,
        },
      },
    },
  ],
}).frameworks;

function newService(
  overrides: MockEngineConfig["scenarioOverrides"] = {},
  frameworkConfigs: readonly FrameworkConfig[] = FRAMEWORK_CONFIGS,
): FailedTransactionsService {
  return new FailedTransactionsService(
    () =>
      new OperationsEngine({
        sdk: new IntegrationSuiteSdkClient({
          defaultTenantId: "primary",
          mockEngineConfig: {
            enabled: true,
            defaultScenario: "success",
            scenarioOverrides: overrides,
          },
        }),
        frameworkConfigs,
      }),
  );
}

const PROCESSING_COUNT = TPM_DLQ_SCENARIOS.filter(
  (s) => s.queueName === MOCK_TPM_PROCESSING_DLQ,
).length;
const RECEIVER_COUNT = TPM_DLQ_SCENARIOS.filter(
  (s) => s.queueName === MOCK_TPM_RECEIVER_DLQ,
).length;

beforeEach(() => {
  resetMockMoves();
  recoveryLockStore.reset();
});

describe("modules/failed-transactions list", () => {
  it("lists both configured TPM dead-letter queues, newest first, with each queue's target", async () => {
    const result = await newService().list({});
    assert.equal(result.total, PROCESSING_COUNT + RECEIVER_COUNT);
    assert.deepEqual(
      result.queues.map((queue) => [queue.queueName, queue.targetQueue, queue.count]),
      [
        [MOCK_TPM_PROCESSING_DLQ, MOCK_TPM_INBOUND_QUEUE, PROCESSING_COUNT],
        [MOCK_TPM_RECEIVER_DLQ, MOCK_TPM_OUTBOUND_QUEUE, RECEIVER_COUNT],
      ],
    );
    const times = result.items.map((row) => row.failedAt);
    assert.deepEqual(times, [...times].sort().reverse());
    const processing = result.items.find(
      (row) => row.messageId === MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
    );
    assert.equal(processing?.deadLetterKind, "processing");
    assert.equal(processing?.targetQueue, MOCK_TPM_INBOUND_QUEUE);
  });

  it("links each visible message to its B2B interchange through its MPL", async () => {
    const result = await newService().list({});
    const row = result.items.find((item) => item.messageId === MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID);
    assert.equal(row?.interchange?.id, TPM_DLQ_SCENARIOS[0]?.interchangeId);
    assert.equal(row?.interchange?.senderPartner, "AMAZONJP (Hills)");
  });

  it("still lists messages when B2B monitoring is unavailable", async () => {
    const result = await newService({ "b2b.findInterchangeByMplId": "error" }).list({});
    assert.equal(result.total, PROCESSING_COUNT + RECEIVER_COUNT);
    assert.ok(result.items.every((row) => row.interchange === undefined));
  });

  it("filters to one queue and by free text", async () => {
    const onlyReceiver = await newService().list({ queue: MOCK_TPM_RECEIVER_DLQ });
    assert.equal(onlyReceiver.total, RECEIVER_COUNT);
    assert.ok(onlyReceiver.items.every((row) => row.queueName === MOCK_TPM_RECEIVER_DLQ));

    const walmart = await newService().list({ search: "walmart" });
    assert.deepEqual(
      walmart.items.map((row) => row.messageId),
      [MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID],
    );
  });

  it("rejects a queue that is not a configured TPM dead-letter queue", async () => {
    await assert.rejects(
      () => newService().list({ queue: MOCK_TPM_INBOUND_QUEUE }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });

  it("answers 503 when TPM_V2 is not configured", async () => {
    await assert.rejects(
      () => newService({}, []).list({}),
      (error: unknown) => error instanceof HttpError && error.statusCode === 503,
    );
  });
});

describe("modules/failed-transactions detail and retry history", () => {
  it("derives the retry history from every processing run sharing the correlation id", async () => {
    const scenario = TPM_DLQ_SCENARIOS[0];
    assert.ok(scenario !== undefined);
    const detail = await newService().getDetail(scenario.jmsMessageId, scenario.queueName);

    assert.equal(detail.history.correlationId, scenario.correlationId);
    assert.equal(detail.history.attempts, scenario.priorRuns + 1);
    assert.equal(detail.history.retries, scenario.priorRuns);
    assert.equal(detail.history.failedAttempts, scenario.priorRuns + 1);
    assert.equal(detail.history.jmsRetryCount, scenario.jmsRetryCount);
    const starts = detail.history.runs.map((run) => run.startTime);
    assert.deepEqual(starts, [...starts].sort().reverse(), "runs are newest first");
    assert.deepEqual(
      detail.recoveryPath.map((step) => [step.action, step.queueName]),
      [
        ["LOCATED", MOCK_TPM_PROCESSING_DLQ],
        ["MOVE", MOCK_TPM_INBOUND_QUEUE],
        ["VERIFY", MOCK_TPM_INBOUND_QUEUE],
        ["RETRY", MOCK_TPM_INBOUND_QUEUE],
      ],
    );
    assert.equal(detail.interchange?.id, scenario.interchangeId);
  });

  it("answers 404 when the message has already left the dead-letter queue", async () => {
    await assert.rejects(
      () => newService().getDetail("not-on-the-queue", MOCK_TPM_PROCESSING_DLQ),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

describe("modules/failed-transactions retry", () => {
  it("moves a processing dead-letter back to SAP_TPM_INBOUND_Q, verifies, then retries", async () => {
    const service = newService();
    const result = await service.retry(
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      MOCK_TPM_PROCESSING_DLQ,
      "test",
    );

    assert.equal(result.outcome.status, "accepted");
    assert.deepEqual(
      result.outcome.steps.map((step) => [step.action, step.queueName, step.succeeded]),
      [
        ["LOCATED", MOCK_TPM_PROCESSING_DLQ, true],
        ["MOVE", MOCK_TPM_INBOUND_QUEUE, true],
        ["VERIFY", MOCK_TPM_INBOUND_QUEUE, true],
        ["RETRY", MOCK_TPM_INBOUND_QUEUE, true],
      ],
    );
    const after = await service.list({ queue: MOCK_TPM_PROCESSING_DLQ });
    assert.ok(
      after.items.every((row) => row.messageId !== MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID),
      "a retried message leaves the dead-letter listing",
    );
  });

  it("moves a receiver dead-letter back to SAP_TPM_OUTBOUND_Q", async () => {
    const result = await newService().retry(
      MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
      MOCK_TPM_RECEIVER_DLQ,
      undefined,
    );
    assert.equal(result.outcome.status, "accepted");
    assert.equal(
      result.outcome.steps.find((step) => step.action === "MOVE")?.queueName,
      MOCK_TPM_OUTBOUND_QUEUE,
    );
  });

  it("never retries when the move fails", async () => {
    const result = await newService({ "jms.moveMessages": "error" }).retry(
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      MOCK_TPM_PROCESSING_DLQ,
      undefined,
    );
    assert.notEqual(result.outcome.status, "accepted");
    assert.ok(result.outcome.steps.every((step) => step.action !== "RETRY"));
    assert.equal(result.outcome.steps.find((step) => step.action === "MOVE")?.succeeded, false);
  });

  it("does not run a second recovery for a message already recovered", async () => {
    const service = newService();
    const first = await service.retry(
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      MOCK_TPM_PROCESSING_DLQ,
      undefined,
    );
    const second = await service.retry(
      MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      MOCK_TPM_PROCESSING_DLQ,
      undefined,
    );
    assert.equal(first.outcome.status, "accepted");
    assert.notEqual(second.outcome.status, "accepted");
    assert.ok(
      second.outcome.steps.every((step) => step.action !== "MOVE"),
      "no second move",
    );
  });

  it("bulk retry runs every item and reports each outcome", async () => {
    const result = await newService().retryMany(
      [
        { messageId: "tpm-dlq-p-01", queueName: MOCK_TPM_PROCESSING_DLQ },
        { messageId: "tpm-dlq-r-01", queueName: MOCK_TPM_RECEIVER_DLQ },
      ],
      "bulk",
    );
    assert.deepEqual(
      result.results.map((entry) => [entry.messageId, entry.outcome.status]),
      [
        ["tpm-dlq-p-01", "accepted"],
        ["tpm-dlq-r-01", "accepted"],
      ],
    );
  });

  it("rejects a retry against a queue that is not a TPM dead-letter queue", async () => {
    await assert.rejects(
      () =>
        newService().retry(MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID, MOCK_TPM_INBOUND_QUEUE, undefined),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });
});

describe("modules/failed-transactions payload", () => {
  const scenario = TPM_DLQ_SCENARIOS.find((s) => s.jmsMessageId.startsWith("tpm-dlq-p-"));

  it("reads a parked message's body from the broker and recognises EDI", async () => {
    assert.ok(scenario !== undefined);
    const payload = await newService().getPayload(scenario.jmsMessageId, scenario.queueName);
    assert.equal(payload.encoding, "text");
    assert.equal(payload.format, "edi");
    assert.match(payload.content, new RegExp(scenario.controlNumber));
    assert.ok(payload.sizeBytes > 0);
  });

  it("answers 404 for a message that has left the queue", async () => {
    assert.ok(scenario !== undefined);
    const service = newService();
    await service.retry(scenario.jmsMessageId, scenario.queueName, undefined);
    await assert.rejects(
      service.getPayload(scenario.jmsMessageId, scenario.queueName),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });

  it("refuses queues that are not TPM dead-letter queues", async () => {
    await assert.rejects(
      newService().getPayload(MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID, MOCK_TPM_INBOUND_QUEUE),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });
});
