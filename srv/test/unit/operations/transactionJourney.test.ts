import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JourneyService } from "../../../src/modules/report-server/journey.js";
import { journeyQuerySchema } from "../../../src/modules/report-server/validators.js";
import { NextActionAdvisor } from "../../../src/operations/transactions/NextActionAdvisor.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import { frameworksSchema } from "../../../src/config/schemas/index.js";
import { recoveryLockStore } from "../../../src/operations/recovery/RecoveryLockStore.js";
import { resetMockMoves } from "../../../src/sdk/mock/fixtures/index.js";
import type {
  JourneyDiagnosis,
  JourneyStage,
  TransactionJourney,
} from "../../../src/operations/dto/index.js";

/** The real configuration: the journey reads framework names and queues from it. */
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

const journeys = (now?: Date): JourneyService =>
  new JourneyService(engine, () => now ?? new Date());

/** "kind:state" per stage, `*` marking the current one. */
function shape(journey: TransactionJourney): string {
  return journey.stages
    .map((stage) => `${stage.kind}:${stage.state}${stage.current ? "*" : ""}`)
    .join(" > ");
}

function actions(journey: TransactionJourney): string[] {
  return journey.actions.map((action) => `${action.code}${action.primary ? "!" : ""}`);
}

beforeEach(() => {
  resetMockMoves();
  recoveryLockStore.reset();
});

describe("NextActionAdvisor.classifyError", () => {
  it("reads the kind of problem from the error text", () => {
    const cases: [string, string][] = [
      ["Partner Directory lookup failed: no routing entry for route key", "partnerDirectory"],
      ["Mapping failure: required segment 'BEG' is missing", "mapping"],
      ["XML validation failed against the target IDoc schema", "mapping"],
      ["AS2 receiver endpoint returned HTTP 503 Service Unavailable.", "connectivity"],
      ["Connection timed out after 60000 ms", "connectivity"],
      ["HTTP 401 Unauthorized from HOME_DEPOT", "authorization"],
      ["SFTP connection refused (auth failed)", "authorization"],
      ["Duplicate interchange control number 000123", "duplicate"],
      ["Something odd happened", "unknown"],
    ];
    for (const [text, kind] of cases) {
      assert.equal(NextActionAdvisor.classifyError(text), kind, text);
    }
    assert.equal(NextActionAdvisor.classifyError(undefined), undefined);
    assert.equal(NextActionAdvisor.classifyError("  "), undefined);
  });
});

describe("NextActionAdvisor.advise", () => {
  const parkedStage = (kind: JourneyStage["kind"], retryTarget?: string): JourneyStage => ({
    kind,
    name: "",
    detail: undefined,
    state: "failed",
    current: true,
    startedAt: undefined,
    endedAt: undefined,
    mplIds: ["mpl-1"],
    failedRuns: 1,
    parked: {
      queueName: "DLQ",
      jmsMessageId: "ID:1",
      parkedAt: "2026-10-26T10:00:00Z",
      retryCount: 5,
      retryTarget,
    },
  });
  const diagnosis = (overrides: Partial<JourneyDiagnosis>): JourneyDiagnosis => ({
    outcome: "stuck",
    stage: "jms",
    since: undefined,
    errorText: undefined,
    errorKind: undefined,
    failedRuns: 1,
    overdue: false,
    ...overrides,
  });
  const codes = (list: readonly { code: string; primary: boolean }[]): string[] =>
    list.map((action) => `${action.code}${action.primary ? "!" : ""}`);

  it("retries a passing connectivity glitch first, but fixes first once retries keep failing", () => {
    const stages = [parkedStage("jms", "Q1")];
    assert.deepEqual(
      codes(
        NextActionAdvisor.advise("nonB2b", stages, diagnosis({ errorKind: "connectivity" }), undefined),
      ),
      ["retry!", "checkReceiver"],
    );
    assert.deepEqual(
      codes(
        NextActionAdvisor.advise(
          "nonB2b",
          stages,
          diagnosis({ errorKind: "connectivity", failedRuns: 3 }),
          undefined,
        ),
      ),
      ["checkReceiver!", "retry"],
    );
  });

  it("asks for a queue when a parked JMS message has no known target", () => {
    const result = NextActionAdvisor.advise("nonB2b", [parkedStage("jms")], diagnosis({}), undefined);
    assert.deepEqual(codes(result), ["chooseQueue!", "investigate"]);
    assert.equal(result[0]?.jmsMessageId, "ID:1");
  });

  it("sends B2B routing errors to the TPM agreement, not the Partner Directory", () => {
    const result = NextActionAdvisor.advise(
      "b2b",
      [parkedStage("tpmProcessing", "SAP_TPM_INBOUND_Q")],
      diagnosis({ stage: "tpmProcessing", errorKind: "partnerDirectory" }),
      "ic-1",
    );
    assert.deepEqual(codes(result), ["fixMapping!", "retry"]);
    assert.equal(result[0]?.interchangeId, "ic-1");
  });
});

describe("modules/report-server journey (non-B2B)", () => {
  it("shows a router Partner Directory failure parked on the router DLQ", async () => {
    const journey = await journeys().get({ id: "corr-nb-router-dlq-la" });
    assert.equal(journey.category, "nonB2b");
    assert.equal(
      shape(journey),
      "sender:done > router:failed* > jms:pending > business:pending > receiver:pending",
      "the router hands over to JMS, so JMS shows as not reached",
    );
    const router = journey.stages.find((stage) => stage.kind === "router");
    assert.equal(router?.detail, "BTP_IS_CORE_LA");
    assert.equal(router?.parked?.queueName, "Common_JMS_ID_Router_DLQ");
    assert.equal(router?.parked?.retryTarget, "Common_JMS_ID_Common_Router");
    assert.equal(journey.diagnosis.outcome, "stuck");
    assert.equal(journey.diagnosis.errorKind, "partnerDirectory");
    assert.deepEqual(actions(journey), ["checkPartnerDirectory!", "retry"]);
    assert.equal(journey.actions[1]?.target, "Common_JMS_ID_Common_Router");
  });

  it("names the JMS queue from the ingress header and fixes first after repeated failures", async () => {
    const journey = await journeys().get({ correlationId: "corr-nb-jms-dlq-header" });
    assert.equal(
      shape(journey),
      "sender:done > router:done > jms:failed* > business:pending > receiver:pending",
    );
    assert.equal(journey.stages[2]?.name, "Common_JMS_ID_LATAM_P1");
    assert.equal(journey.diagnosis.failedRuns, 3);
    assert.deepEqual(actions(journey), ["checkReceiver!", "retry"]);
  });

  it("finds the transaction from any of its processing logs", async () => {
    const journey = await journeys().get({ mplId: "nb-jms-dlq-consumer-s2" });
    assert.equal(journey.correlationId, "corr-nb-jms-dlq-consumer");
    assert.equal(journey.stages.find((stage) => stage.kind === "jms")?.name, "Common_JMS_ID_AS_P2");
    assert.deepEqual(actions(journey), ["retry!", "checkReceiver"]);
  });

  it("asks the operator to choose a queue when nothing names it", async () => {
    const journey = await journeys().get({ id: "corr-nb-jms-dlq-unresolved" });
    assert.equal(journey.stages.find((stage) => stage.current)?.parked?.retryTarget, undefined);
    assert.equal(journey.actions[0]?.code, "chooseQueue");
  });

  it("reports a delivered transaction as completed with nothing to do", async () => {
    const journey = await journeys().get({ id: "corr-nb-router-jms-ok" });
    assert.equal(
      shape(journey),
      "sender:done > router:done > jms:done > business:done > receiver:done",
    );
    assert.equal(journey.diagnosis.outcome, "completed");
    assert.equal(journey.diagnosis.errorText, undefined);
    assert.deepEqual(actions(journey), ["none!"]);
  });

  it("waits on a message JMS is still retrying, until it is overdue", async () => {
    const recent = await journeys().get({ id: "corr-nb-jms-retrying" });
    assert.equal(shape(recent), "sender:done > jms:active* > business:pending > receiver:pending");
    assert.equal(recent.diagnosis.outcome, "inProgress");
    assert.deepEqual(actions(recent), ["wait!"]);

    const later = await journeys(new Date(Date.now() + 3 * 3_600_000)).get({
      id: "corr-nb-jms-retrying",
    });
    assert.equal(later.diagnosis.overdue, true);
    assert.equal(later.diagnosis.outcome, "stuck");
    assert.deepEqual(actions(later), ["investigate!", "wait"]);
  });

  it("explains a failed business flow that is not parked anywhere", async () => {
    const journey = await journeys().get({ id: "corr-nb-plain-failed" });
    assert.equal(shape(journey), "sender:done > business:failed* > receiver:pending");
    assert.equal(journey.diagnosis.errorKind, "mapping");
    assert.deepEqual(actions(journey), ["fixMapping!", "resendFromSender"]);
    assert.equal(journey.actions[0]?.mplId, "nb-plain-failed-s0");
  });
});

describe("modules/report-server journey (B2B)", () => {
  it("resolves an interchange id and shows a processing failure on the TPM DLQ", async () => {
    const journey = await journeys().get({ id: "40f83297bb48e5953b421d860b04dac1" });
    assert.equal(journey.category, "b2b");
    assert.equal(journey.interchangeId, "40f83297bb48e5953b421d860b04dac1");
    assert.equal(journey.document, "ASC-X12 850");
    assert.equal(
      shape(journey),
      "sender:done > tpmProcessing:failed* > tpmDelivery:pending > receiver:pending",
    );
    const current = journey.stages.find((stage) => stage.current);
    assert.equal(current?.parked?.retryTarget, "SAP_TPM_INBOUND_Q");
    assert.equal(journey.diagnosis.errorKind, "mapping");
    assert.deepEqual(actions(journey), ["fixMapping!", "retry"]);
  });

  it("shows a delivery failure on the receiver DLQ and retries a connectivity error first", async () => {
    const journey = await journeys().get({ interchangeId: "7c1e2a9d0b3f4e5a8c6d1f2e3a4b5c6d" });
    assert.equal(
      shape(journey),
      "sender:done > tpmProcessing:done > tpmDelivery:failed* > receiver:pending",
    );
    assert.equal(journey.diagnosis.errorKind, "connectivity");
    assert.equal(journey.actions[0]?.code, "retry");
    assert.equal(journey.actions[0]?.target, "SAP_TPM_OUTBOUND_Q");
  });

  it("finds a B2B transaction by its correlation id", async () => {
    const journey = await journeys().get({ id: "corr-tpm-dlq-p-01" });
    assert.equal(journey.category, "b2b");
    assert.equal(journey.sender, "TARGET_CORP");
  });
});

describe("modules/report-server journey lookups", () => {
  it("answers 404 when no id matches", async () => {
    await assert.rejects(
      () => journeys().get({ id: "no-such-transaction" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });

  it("accepts exactly one id", () => {
    assert.equal(journeyQuerySchema.safeParse({ id: "x" }).success, true);
    assert.equal(journeyQuerySchema.safeParse({}).success, false);
    assert.equal(journeyQuerySchema.safeParse({ id: "x", mplId: "y" }).success, false);
  });
});
