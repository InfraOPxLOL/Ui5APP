import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TransactionsService } from "../../../src/modules/report-server/transactions.js";
import { FailedTransactionsService } from "../../../src/modules/failed-transactions/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import { frameworksSchema } from "../../../src/config/schemas/index.js";
import { recoveryLockStore } from "../../../src/operations/recovery/RecoveryLockStore.js";
import {
  MOCK_JMS_DLQ,
  MOCK_ROUTER_DEAD_LETTER_QUEUE,
  MOCK_ROUTER_PROCESSING_QUEUE,
  NON_B2B_SCENARIOS,
  resetMockMoves,
  type NonB2bScenario,
} from "../../../src/sdk/mock/fixtures/index.js";

/** The real configuration: these tests pin the queue mappings operators rely on. */
const FRAMEWORKS = frameworksSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../config/frameworks.json", import.meta.url)),
      "utf8",
    ),
  ),
).frameworks;

function engine(): OperationsEngine {
  return new OperationsEngine({
    sdk: new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    }),
    frameworkConfigs: FRAMEWORKS,
  });
}

const transactions = (): TransactionsService => new TransactionsService(engine);
const failed = (): FailedTransactionsService => new FailedTransactionsService(engine);

function scenario(key: string): NonB2bScenario {
  const found = NON_B2B_SCENARIOS.find((candidate) => candidate.key === key);
  if (found === undefined) {
    throw new Error(`fixture: no scenario ${key}`);
  }
  return found;
}

beforeEach(() => {
  resetMockMoves();
  recoveryLockStore.reset();
});

describe("modules/report-server non-B2B transactions", () => {
  it("folds each correlation chain into one row and leaves TPM flows to the B2B side", async () => {
    const result = await transactions().list({ pageSize: 200 });
    const ids = result.items.map((row) => row.correlationId);
    assert.equal(new Set(ids).size, ids.length, "one row per correlation id");

    const routed = result.items.find((row) => row.correlationId === "corr-nb-router-jms-ok");
    assert.ok(routed !== undefined);
    assert.equal(routed.businessFlow, "IF_Order_to_SFDC");
    assert.equal(routed.stepCount, 6);
    assert.deepEqual(routed.frameworks, ["COMMON_IDOC_ROUTER", "JMS_FRAMEWORK"]);
    assert.equal(routed.statusCategory, "success");
    assert.equal(routed.sender, "S4_LA");
    assert.equal(routed.receiver, "SFDC");

    assert.ok(
      result.items.every((row) => !row.headline.integrationFlow.startsWith("SAP_TPM_")),
      "TPM transactions are B2B",
    );
  });

  it("filters on the framework used", async () => {
    const router = await transactions().list({ pageSize: 200, framework: "router" });
    assert.ok(router.items.length > 0);
    assert.ok(router.items.every((row) => row.frameworks.includes("COMMON_IDOC_ROUTER")));
    const none = await transactions().list({ pageSize: 200, framework: "none" });
    assert.ok(none.items.every((row) => row.frameworks.length === 0));
  });

  it("finds a transaction by any of its processing logs", async () => {
    const result = await transactions().list({ mplId: "nb-jms-ok-s1" });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.businessFlow, "IF_Invoice_to_Coupa");
  });

  it("reads the queue from the ingress header and reports where the message is parked", async () => {
    const detail = await transactions().getById("corr-nb-jms-dlq-header");
    assert.equal(detail.jms?.queue, "Common_JMS_ID_LATAM_P1");
    assert.equal(detail.jms?.queueSource, "header");
    assert.equal(detail.jms?.stage, "failed");
    assert.match(detail.queueHeader ?? "", /Common_JMS_ID_LATAM_P1/);
    assert.equal(detail.router?.inbound, "BTP_IS_CORE_CC");
    assert.equal(detail.steps.length, 6);
    assert.deepEqual(
      detail.parked.map((entry) => [entry.queueName, entry.retryTarget]),
      [[MOCK_JMS_DLQ, "Common_JMS_ID_LATAM_P1"]],
    );
    assert.ok(detail.errors.length > 0, "failed consumer runs carry their error text");
  });

  it("shows a router message parked on the router DLQ with its retry target", async () => {
    const detail = await transactions().getById("corr-nb-router-dlq-la");
    assert.equal(detail.router?.stage, "failed");
    assert.deepEqual(
      detail.parked.map((entry) => [entry.queueName, entry.retryTarget]),
      [[MOCK_ROUTER_DEAD_LETTER_QUEUE, MOCK_ROUTER_PROCESSING_QUEUE]],
    );
  });

  it("answers 404 for an unknown correlation id", async () => {
    await assert.rejects(
      transactions().getById("corr-no-such"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

describe("modules/failed-transactions non-B2B", () => {
  it("lists the JMS framework DLQ and the router DLQ, each with its kind", async () => {
    const result = await failed().list({ category: "nonB2b", pageSize: 100 });
    assert.equal(result.category, "nonB2b");
    assert.deepEqual(
      result.queues.map((queue) => [queue.queueName, queue.deadLetterKind]).sort(),
      [
        [MOCK_JMS_DLQ, "jms"],
        [MOCK_ROUTER_DEAD_LETTER_QUEUE, "router"],
      ].sort(),
    );
    const parked = NON_B2B_SCENARIOS.filter((entry) => entry.parked !== undefined).length;
    assert.equal(result.total, parked);
    assert.ok(result.items.every((row) => row.category === "nonB2b"));
  });

  it("shows each JMS message's destination and how it was found", async () => {
    const result = await failed().list({ category: "nonB2b", pageSize: 100 });
    const byId = new Map(result.items.map((row) => [row.messageId, row]));
    // The list reads chains only, so the consumer flow is its evidence; the header is read on open.
    assert.equal(byId.get("ID:nb-jms-dlq-consumer")?.targetQueue, "Common_JMS_ID_AS_P2");
    assert.equal(byId.get("ID:nb-jms-dlq-consumer")?.targetSource, "consumerFlow");
    assert.equal(byId.get("ID:nb-jms-dlq-unresolved")?.targetQueue, undefined);
    assert.equal(byId.get("ID:nb-router-dlq-la")?.targetQueue, MOCK_ROUTER_PROCESSING_QUEUE);
    assert.equal(byId.get("ID:nb-router-dlq-la")?.targetSource, "configured");
    assert.ok((byId.get("ID:nb-router-dlq-la")?.path.length ?? 0) > 0);
  });

  it("prefers the ingress header on the detail, and offers queues only when it must", async () => {
    const header = await failed().getDetail("ID:nb-jms-dlq-header", MOCK_JMS_DLQ);
    assert.equal(header.message.targetQueue, "Common_JMS_ID_LATAM_P1");
    assert.equal(header.message.targetSource, "header");
    assert.deepEqual(header.queueOptions, []);
    assert.equal(header.transaction?.steps.length, 6);
    assert.deepEqual(
      header.recoveryPath.map((step) => step.action),
      ["LOCATED", "MOVE", "VERIFY", "RETRY"],
    );

    const unresolved = await failed().getDetail("ID:nb-jms-dlq-unresolved", MOCK_JMS_DLQ);
    assert.equal(unresolved.message.targetQueue, undefined);
    assert.equal(unresolved.queueOptions.length, 20);
    assert.equal(unresolved.recoveryPath.at(-1)?.action, "MANUAL");
  });

  it("retries a JMS message to the queue its header names", async () => {
    const result = await failed().retry("ID:nb-jms-dlq-header", MOCK_JMS_DLQ, undefined);
    assert.equal(result.outcome.status, "accepted");
    const move = result.outcome.steps.find((step) => step.action === "MOVE");
    assert.equal(move?.queueName, "Common_JMS_ID_LATAM_P1");
  });

  it("retries a JMS message without a header to the queue its consumer flow names", async () => {
    const result = await failed().retry("ID:nb-jms-dlq-consumer", MOCK_JMS_DLQ, undefined);
    assert.equal(result.outcome.status, "accepted");
    assert.equal(
      result.outcome.steps.find((step) => step.action === "MOVE")?.queueName,
      "Common_JMS_ID_AS_P2",
    );
  });

  it("does not guess: an unresolved JMS message waits for the operator's choice", async () => {
    const refused = await failed().retry("ID:nb-jms-dlq-unresolved", MOCK_JMS_DLQ, undefined);
    assert.equal(refused.outcome.status, "unavailable");
    assert.ok(!refused.outcome.steps.some((step) => step.action === "MOVE"));

    const chosen = await failed().retry(
      "ID:nb-jms-dlq-unresolved",
      MOCK_JMS_DLQ,
      undefined,
      "Common_JMS_ID_Generic_P3",
    );
    assert.equal(chosen.outcome.status, "accepted");
    assert.equal(
      chosen.outcome.steps.find((step) => step.action === "MOVE")?.queueName,
      "Common_JMS_ID_Generic_P3",
    );
  });

  it("refuses an operator choice that is not one of the framework's processing queues", async () => {
    await assert.rejects(
      failed().retry("ID:nb-jms-dlq-unresolved", MOCK_JMS_DLQ, undefined, "SOME_OTHER_QUEUE"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });

  it("moves a router dead-letter back to the router's processing queue", async () => {
    const result = await failed().retry(
      "ID:nb-router-dlq-hu",
      MOCK_ROUTER_DEAD_LETTER_QUEUE,
      undefined,
    );
    assert.equal(result.outcome.status, "accepted");
    assert.equal(
      result.outcome.steps.find((step) => step.action === "MOVE")?.queueName,
      MOCK_ROUTER_PROCESSING_QUEUE,
    );
    const after = await failed().list({ category: "nonB2b", pageSize: 100 });
    assert.ok(
      !after.items.some((row) => row.messageId === "ID:nb-router-dlq-hu"),
      "it left the DLQ",
    );
  });

  it("keeps the B2B category to the TPM queues", async () => {
    const b2b = await failed().list({ category: "b2b", pageSize: 100 });
    assert.ok(b2b.queues.every((queue) => queue.framework === "TPM_V2"));
    assert.ok(!b2b.items.some((row) => row.queueName === MOCK_JMS_DLQ));
  });

  it("serves the parked body of a non-B2B message", async () => {
    const payload = await failed().getPayload("ID:nb-router-dlq-la", MOCK_ROUTER_DEAD_LETTER_QUEUE);
    assert.equal(payload.format, "xml");
    assert.match(payload.content, new RegExp(scenario("nb-router-dlq-la").applicationId));
  });
});

describe("modules/report-server transaction controller", () => {
  it("passes every filter the route validates on to the service", async () => {
    const { toTransactionQuery } = await import("../../../src/modules/report-server/controller.js");
    const { transactionListQuerySchema } = await import(
      "../../../src/modules/report-server/validators.js"
    );
    const fields = Object.keys(transactionListQuerySchema.shape).filter(
      (field) => field !== "page" && field !== "pageSize",
    );
    const query = Object.fromEntries(fields.map((field) => [field, `value-${field}`]));
    const parsed = toTransactionQuery(query) as unknown as Record<string, unknown>;
    for (const field of fields) {
      assert.equal(parsed[field], `value-${field}`, field);
    }
  });
});
