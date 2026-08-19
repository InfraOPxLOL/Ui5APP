import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { RecoveryStrategyResolver } from "../../../src/operations/recovery/RecoveryStrategyResolver.js";
import { RecoveryLockStore } from "../../../src/operations/recovery/RecoveryLockStore.js";
import { RecoveryEngine } from "../../../src/operations/engines/RecoveryEngine.js";
import { FrameworkDetectionEngine } from "../../../src/operations/engines/FrameworkDetectionEngine.js";
import { frameworksSchema, type FrameworkConfig } from "../../../src/config/schemas/index.js";
import type { QueueEngine } from "../../../src/operations/engines/QueueEngine.js";
import type {
  FrameworkDetection,
  MessageSummary,
  QueuedMessageSummary,
} from "../../../src/operations/dto/index.js";
import type { RecoveryContext } from "../../../src/operations/recovery/RecoveryStrategy.js";

/**
 * Framework-aware recovery strategies (Phase 13, §§2–6, 10).
 *
 * These use a scripted fake `QueueEngine` rather than the mock SDK so each test can assert the exact
 * sequence of tenant calls a strategy made — the point of most of these cases is *what was called and
 * in what order*, especially that a retry never follows an unverified move.
 */

const FRAMEWORKS: readonly FrameworkConfig[] = frameworksSchema.parse({
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
      detect: { integrationFlowPatterns: ["^SAP_TPM_"] },
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

const JMS_QUEUE_HEADER = {
  "CH-Message-Queue":
    "📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]",
};

const MESSAGE_ID = "msg-under-test";

function message(overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    messageId: MESSAGE_ID,
    correlationId: "corr-1",
    integrationFlow: "SAP_TPM_COM_OutboundProcessing",
    status: "FAILED",
    humanReadableStatus: "Failed",
    severity: "error",
    startTime: new Date().toISOString(),
    endTime: undefined,
    processingTimeMs: 10,
    processingTimeHuman: "10 ms",
    sender: "S",
    receiver: "R",
    applicationId: undefined,
    messageType: undefined,
    customStatus: undefined,
    ...overrides,
  };
}

/** Records every tenant interaction so tests can assert on the exact call sequence. */
interface FakeQueueOptions {
  /** Queues the message is currently on. Mutated by a successful move. */
  readonly presentOn: Set<string>;
  /** When true, `moveMessages` rejects. */
  readonly failMove?: boolean;
  /** When true, the move "succeeds" but the message never appears on the target — the danger case. */
  readonly moveSilentlyLoses?: boolean;
  /** When true, `retryMessage` reports `accepted: false`. */
  readonly rejectRetry?: boolean;
  /** When true, `retryMessage` throws. */
  readonly failRetry?: boolean;
}

function fakeQueue(options: FakeQueueOptions): {
  engine: QueueEngine;
  calls: string[];
} {
  const calls: string[] = [];
  const engine = {
    async getMessage(
      queueName: string,
      messageId: string,
    ): Promise<QueuedMessageSummary | undefined> {
      calls.push(`get:${queueName}`);
      if (!options.presentOn.has(queueName)) {
        return undefined;
      }
      return {
        messageId,
        queueName,
        enqueuedAt: new Date().toISOString(),
        retryCount: 2,
        sizeBytes: 1024,
        sizeHuman: "1 KB",
      };
    },
    async moveMessages(
      sourceQueue: string,
      targetQueue: string,
      messageIds: readonly string[],
    ): Promise<void> {
      calls.push(`move:${sourceQueue}->${targetQueue}:${messageIds.join(",")}`);
      if (options.failMove === true) {
        throw new Error("tenant rejected the move");
      }
      options.presentOn.delete(sourceQueue);
      if (options.moveSilentlyLoses !== true) {
        options.presentOn.add(targetQueue);
      }
    },
    async retryMessage(messageId: string, queueName: string) {
      calls.push(`retry:${queueName}`);
      if (options.failRetry === true) {
        throw new Error("tenant rejected the retry");
      }
      return { messageId, accepted: options.rejectRetry !== true, correlationId: undefined };
    },
  } as unknown as QueueEngine;
  return { engine, calls };
}

/** Runs full detection against the scripted queue state, so plans see a realistic detection result. */
async function detect(
  source: MessageSummary,
  correlationGroup: readonly MessageSummary[],
  headers: Readonly<Record<string, string>>,
  presentOn: ReadonlySet<string>,
): Promise<FrameworkDetection> {
  return new FrameworkDetectionEngine(FRAMEWORKS).detectFull(
    source,
    correlationGroup,
    headers,
    async (queueName) => presentOn.has(queueName),
  );
}

function context(
  overrides: Partial<RecoveryContext> & Pick<RecoveryContext, "detection" | "queue">,
): RecoveryContext {
  return {
    message: message(),
    customHeaders: {},
    reason: undefined,
    operatorSelectedQueue: undefined,
    ...overrides,
  };
}

const resolver = new RecoveryStrategyResolver(FRAMEWORKS);

describe("operations/recovery TPM V2 strategy", () => {
  it("walks the traversal order and stops at the first queue holding the message", async () => {
    const presentOn = new Set(["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"]);
    const { engine, calls } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const plan = await resolver
      .resolve(detection)
      .resolve(context({ detection, queue: engine }));

    assert.equal(plan.framework, "TPM_V2");
    assert.equal(plan.currentQueue, "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q");
    assert.deepEqual(
      calls,
      [
        "get:SAP_TPM_INBOUND_Q",
        "get:SAP_TPM_OUTBOUND_Q",
        "get:SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
      ],
      "the receiver DLQ must not be probed once the message is found",
    );
  });

  it("maps the processing DLQ back to the inbound queue", async () => {
    const presentOn = new Set(["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const plan = await resolver.resolve(detection).resolve(context({ detection, queue: engine }));

    assert.equal(plan.action, "MOVE_THEN_RETRY");
    assert.equal(plan.moveRequired, true);
    assert.equal(plan.targetQueue, "SAP_TPM_INBOUND_Q");
    assert.equal(plan.recoveryState, "DLQ_RECOVERY_AVAILABLE");
    assert.equal(plan.executable, true);
  });

  it("maps the receiver DLQ back to the outbound queue", async () => {
    const presentOn = new Set(["SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const plan = await resolver.resolve(detection).resolve(context({ detection, queue: engine }));

    assert.equal(plan.targetQueue, "SAP_TPM_OUTBOUND_Q");
  });

  it("retries in place when the message is already on an active queue", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const plan = await resolver.resolve(detection).resolve(context({ detection, queue: engine }));

    assert.equal(plan.action, "RETRY_IN_PLACE");
    assert.equal(plan.moveRequired, false);
    assert.equal(plan.recoveryState, "RETRY_AVAILABLE");
  });

  it("falls through to NOT_FOUND when the message is on none of its framework's queues", async () => {
    const presentOn = new Set<string>();
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const plan = await resolver.resolve(detection).resolve(context({ detection, queue: engine }));

    assert.equal(plan.framework, "TPM_V2");
    assert.equal(plan.recoveryState, "NOT_FOUND");
    assert.equal(plan.executable, false, "nothing can be retried when nothing was located");
  });
});

describe("operations/recovery TPM V2 execution", () => {
  it("performs move, verify, then retry in that order", async () => {
    const presentOn = new Set(["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"]);
    const { engine, calls } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine });
    const plan = await strategy.resolve(ctx);
    calls.length = 0;

    const outcome = await strategy.execute(ctx, plan);

    assert.deepEqual(
      calls,
      [
        "move:SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q->SAP_TPM_INBOUND_Q:msg-under-test",
        "get:SAP_TPM_INBOUND_Q",
        "retry:SAP_TPM_INBOUND_Q",
      ],
      "the move must target this one message, be verified, and only then be retried",
    );
    assert.equal(outcome.status, "accepted");
    assert.deepEqual(
      outcome.steps.map((step) => step.action),
      ["LOCATED", "MOVE", "VERIFY", "RETRY"],
    );
    assert.ok(outcome.steps.every((step) => step.succeeded));
  });

  it("does NOT retry when the move was accepted but verification cannot find the message", async () => {
    const presentOn = new Set(["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"]);
    const { engine, calls } = fakeQueue({ presentOn, moveSilentlyLoses: true });
    const detection = await detect(message(), [message()], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine });
    const plan = await strategy.resolve(ctx);
    calls.length = 0;

    const outcome = await strategy.execute(ctx, plan);

    assert.ok(
      !calls.some((call) => call.startsWith("retry:")),
      "a retry after an unverified move would report a success that did not happen",
    );
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.recoveryState, "MANUAL_INVESTIGATION_REQUIRED");
    const verify = outcome.steps.find((step) => step.action === "VERIFY");
    assert.ok(verify !== undefined && !verify.succeeded);
  });

  it("stops at the move and retries nothing when the move itself fails", async () => {
    const presentOn = new Set(["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"]);
    const { engine, calls } = fakeQueue({ presentOn, failMove: true });
    const detection = await detect(message(), [message()], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine });
    const plan = await strategy.resolve(ctx);
    calls.length = 0;

    const outcome = await strategy.execute(ctx, plan);

    assert.ok(!calls.some((call) => call.startsWith("retry:")));
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.steps.at(-1)?.action, "MOVE");
    assert.match(outcome.note, /remains on/i);
  });

  it("reports FAILED_AGAIN when the tenant rejects the retry", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine } = fakeQueue({ presentOn, rejectRetry: true });
    const detection = await detect(message(), [message()], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine });
    const plan = await strategy.resolve(ctx);

    const outcome = await strategy.execute(ctx, plan);

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.recoveryState, "FAILED_AGAIN");
  });

  it("reports accepted — never successful — since processing outcome is only visible later", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine });
    const plan = await strategy.resolve(ctx);

    const outcome = await strategy.execute(ctx, plan);

    assert.equal(outcome.status, "accepted");
    assert.equal(outcome.recoveryState, "RETRYING");
  });
});

describe("operations/recovery JMS framework strategy", () => {
  const jmsGroup = [
    message({ integrationFlow: "Some_Flow" }),
    message({ messageId: "in", integrationFlow: "IF_JMS_ingress" }),
    message({ messageId: "eg", integrationFlow: "IF_JMS_egress" }),
  ];

  it("resolves the queue from the custom header and retries in place", async () => {
    const presentOn = new Set(["Common_JMS_ID_Ecom_P1"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(
      message({ integrationFlow: "Some_Flow" }),
      jmsGroup,
      JMS_QUEUE_HEADER,
      presentOn,
    );
    const plan = await resolver.resolve(detection).resolve(
      context({
        detection,
        queue: engine,
        message: message({ integrationFlow: "Some_Flow" }),
        customHeaders: JMS_QUEUE_HEADER,
      }),
    );

    assert.equal(plan.framework, "JMS_FRAMEWORK");
    assert.equal(plan.currentQueue, "Common_JMS_ID_Ecom_P1");
    assert.equal(plan.action, "RETRY_IN_PLACE");
  });

  it("falls back to the central DLQ and moves back to the header-resolved queue", async () => {
    const presentOn = new Set(["Common_JMS_ID_DLQ"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(
      message({ integrationFlow: "Some_Flow" }),
      jmsGroup,
      JMS_QUEUE_HEADER,
      presentOn,
    );
    const plan = await resolver.resolve(detection).resolve(
      context({
        detection,
        queue: engine,
        message: message({ integrationFlow: "Some_Flow" }),
        customHeaders: JMS_QUEUE_HEADER,
      }),
    );

    assert.equal(plan.currentQueue, "Common_JMS_ID_DLQ");
    assert.equal(plan.action, "MOVE_THEN_RETRY");
    assert.equal(
      plan.targetQueue,
      "Common_JMS_ID_Ecom_P1",
      "the central DLQ serves every JMS queue, so the target is this message's own resolved queue",
    );
  });

  it("asks the operator to select a queue rather than guessing when the header cannot be parsed", async () => {
    const presentOn = new Set<string>();
    const { engine, calls } = fakeQueue({ presentOn });
    const detection = await detect(
      message({ integrationFlow: "Some_Flow" }),
      jmsGroup,
      {},
      presentOn,
    );
    const plan = await resolver.resolve(detection).resolve(
      context({
        detection,
        queue: engine,
        message: message({ integrationFlow: "Some_Flow" }),
        customHeaders: {},
      }),
    );

    assert.equal(plan.framework, "JMS_FRAMEWORK");
    assert.equal(plan.recoveryState, "MANUAL_INVESTIGATION_REQUIRED");
    assert.equal(plan.executable, false);
    assert.equal(plan.currentQueue, undefined);
    assert.deepEqual(calls, [], "no queue may be probed when none was legitimately resolved");
    assert.match(plan.explanation, /no queue is assumed/i);
  });

  it("uses an operator-selected queue when the header is unparseable", async () => {
    const presentOn = new Set(["Operator_Chosen_Q"]);
    const { engine } = fakeQueue({ presentOn });
    const detection = await detect(
      message({ integrationFlow: "Some_Flow" }),
      jmsGroup,
      {},
      presentOn,
    );
    const plan = await resolver.resolve(detection).resolve(
      context({
        detection,
        queue: engine,
        message: message({ integrationFlow: "Some_Flow" }),
        customHeaders: {},
        operatorSelectedQueue: "Operator_Chosen_Q",
      }),
    );

    assert.equal(plan.executable, true);
    assert.equal(plan.currentQueue, "Operator_Chosen_Q");
  });
});

describe("operations/recovery IDoc router and status sync strategies", () => {
  it("recovers a Common IDoc Router message from its DLQ to its processing queue", async () => {
    const presentOn = new Set(["Common_Router_JMS_DLQ"]);
    const { engine, calls } = fakeQueue({ presentOn });
    const source = message({ integrationFlow: "IDoc_Router_Dispatch" });
    const detection = await detect(source, [source], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine, message: source });
    const plan = await strategy.resolve(ctx);
    calls.length = 0;

    assert.equal(plan.framework, "COMMON_IDOC_ROUTER");
    assert.equal(plan.targetQueue, "Common_Router_JMS");

    const outcome = await strategy.execute(ctx, plan);
    assert.deepEqual(calls, [
      "move:Common_Router_JMS_DLQ->Common_Router_JMS:msg-under-test",
      "get:Common_Router_JMS",
      "retry:Common_Router_JMS",
    ]);
    assert.equal(outcome.status, "accepted");
  });

  it("recovers an IDoc Status Sync message from its DLQ to Status_JMS", async () => {
    const presentOn = new Set(["Status_JMS_DLQ"]);
    const { engine } = fakeQueue({ presentOn });
    const source = message({ integrationFlow: "IDoc_Status_Update_997" });
    const detection = await detect(source, [source], {}, presentOn);
    const plan = await resolver
      .resolve(detection)
      .resolve(context({ detection, queue: engine, message: source }));

    assert.equal(plan.framework, "IDOC_STATUS_SYNC");
    assert.equal(plan.targetQueue, "Status_JMS");
    assert.equal(plan.action, "MOVE_THEN_RETRY");
  });

  it("retries an IDoc Status Sync message in place when it is on Status_JMS", async () => {
    const presentOn = new Set(["Status_JMS"]);
    const { engine } = fakeQueue({ presentOn });
    const source = message({ integrationFlow: "IDoc_Status_Update_997" });
    const detection = await detect(source, [source], {}, presentOn);
    const plan = await resolver
      .resolve(detection)
      .resolve(context({ detection, queue: engine, message: source }));

    assert.equal(plan.action, "RETRY_IN_PLACE");
    assert.equal(plan.targetQueue, "Status_JMS");
  });
});

describe("operations/recovery manual strategy", () => {
  it("handles an UNKNOWN framework without executing anything", async () => {
    const presentOn = new Set<string>();
    const { engine, calls } = fakeQueue({ presentOn });
    const source = message({ integrationFlow: "Totally_Unrelated_Flow" });
    const detection = await detect(source, [source], {}, presentOn);
    const strategy = resolver.resolve(detection);
    const ctx = context({ detection, queue: engine, message: source });
    const plan = await strategy.resolve(ctx);
    calls.length = 0;

    assert.equal(plan.supported, false);
    assert.equal(plan.executable, false);
    assert.ok(
      plan.recoveryState === "MANUAL_INVESTIGATION_REQUIRED" ||
        plan.recoveryState === "UNSUPPORTED",
    );

    const outcome = await strategy.execute(ctx, plan);
    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(calls, [], "the manual strategy must never touch the tenant");
  });

  it("carries the detection evidence into the plan so the operator sees why nothing matched", async () => {
    const presentOn = new Set<string>();
    const { engine } = fakeQueue({ presentOn });
    const source = message({ integrationFlow: "Totally_Unrelated_Flow" });
    const detection = await detect(source, [source], {}, presentOn);
    const plan = await resolver
      .resolve(detection)
      .resolve(context({ detection, queue: engine, message: source }));

    assert.ok(plan.detection.evidence.length > 0);
    assert.ok(plan.detection.evidence.some((entry) => !entry.matched));
  });
});

describe("operations/recovery RecoveryLockStore", () => {
  let store: RecoveryLockStore;

  beforeEach(() => {
    store = new RecoveryLockStore();
  });

  it("grants the lock once and refuses a concurrent second claim", () => {
    assert.equal(store.tryAcquire("m1").kind, "acquired");
    const second = store.tryAcquire("m1");
    assert.equal(second.kind, "in-flight");
  });

  it("reports a recently completed recovery as already-processed", () => {
    store.tryAcquire("m1");
    store.release("m1", "Retry accepted.");
    const repeat = store.tryAcquire("m1");
    assert.equal(repeat.kind, "already-processed");
  });

  it("allows an immediate retry when the attempt never reached the tenant", () => {
    store.tryAcquire("m1");
    store.release("m1");
    assert.equal(
      store.tryAcquire("m1").kind,
      "acquired",
      "a blocked attempt must not lock the operator out once they fix the cause",
    );
  });

  it("does not block a different message", () => {
    store.tryAcquire("m1");
    assert.equal(store.tryAcquire("m2").kind, "acquired");
  });

  it("reclaims a stale lock whose holder never released it", () => {
    const shortLived = new RecoveryLockStore(60_000, 0);
    shortLived.tryAcquire("m1");
    assert.equal(
      shortLived.tryAcquire("m1").kind,
      "acquired",
      "a crashed request must not block a message for the process lifetime",
    );
  });

  it("forgets a completion once its TTL expires", () => {
    const shortTtl = new RecoveryLockStore(0);
    shortTtl.tryAcquire("m1");
    shortTtl.release("m1", "done");
    assert.equal(shortTtl.tryAcquire("m1").kind, "acquired");
  });
});

describe("operations/recovery duplicate protection through RecoveryEngine", () => {
  function engineWith(queue: QueueEngine, lockStore: RecoveryLockStore): RecoveryEngine {
    return new RecoveryEngine(
      queue,
      {} as never,
      {} as never,
      [],
      { dedupe: async (_key: string, fn: () => unknown) => fn() } as never,
      undefined,
      resolver,
      lockStore,
    );
  }

  it("executes only one of two concurrent recoveries of the same message", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine: queue, calls } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const engine = engineWith(queue, new RecoveryLockStore());
    const input = { message: message(), detection, customHeaders: {} };

    const [first, second] = await Promise.all([
      engine.executeMessageRecovery(input),
      engine.executeMessageRecovery(input),
    ]);

    const retries = calls.filter((call) => call.startsWith("retry:"));
    assert.equal(retries.length, 1, "the tenant must see exactly one retry");
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, ["accepted", "unavailable"]);
    const blocked = [first, second].find((outcome) => outcome.status === "unavailable");
    assert.equal(blocked?.recoveryState, "RETRYING");
  });

  it("reports a repeat attempt as already-processed rather than retrying twice", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine: queue, calls } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const engine = engineWith(queue, new RecoveryLockStore());
    const input = { message: message(), detection, customHeaders: {} };

    await engine.executeMessageRecovery(input);
    const repeat = await engine.executeMessageRecovery(input);

    assert.equal(repeat.status, "already-processed");
    assert.equal(repeat.recoveryState, "COMPLETED");
    assert.equal(calls.filter((call) => call.startsWith("retry:")).length, 1);
  });

  it("surfaces an in-flight recovery as non-executable in a freshly resolved plan", async () => {
    const presentOn = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine: queue } = fakeQueue({ presentOn });
    const detection = await detect(message(), [message()], {}, presentOn);
    const lockStore = new RecoveryLockStore();
    const engine = engineWith(queue, lockStore);
    lockStore.tryAcquire(MESSAGE_ID);

    const plan = await engine.resolveRecoveryPlan({
      message: message(),
      detection,
      customHeaders: {},
    });

    assert.equal(plan.recoveryState, "RETRYING");
    assert.equal(plan.executable, false);
  });
});

describe("operations/recovery plan generation", () => {
  it("splits executable from non-executable messages in a bulk plan", async () => {
    const recoverable = new Set(["SAP_TPM_INBOUND_Q"]);
    const { engine: queue } = fakeQueue({ presentOn: recoverable });

    const tpm = message({ messageId: "tpm-1" });
    const orphan = message({ messageId: "unknown-1", integrationFlow: "Totally_Unrelated_Flow" });
    const tpmDetection = await detect(tpm, [tpm], {}, recoverable);
    const orphanDetection = await detect(orphan, [orphan], {}, new Set());

    const engine = new RecoveryEngine(
      queue,
      {} as never,
      {} as never,
      [],
      { dedupe: async (_key: string, fn: () => unknown) => fn() } as never,
      undefined,
      resolver,
      new RecoveryLockStore(),
    );

    const batch = await engine.buildRecoveryPlan([
      { message: tpm, detection: tpmDetection, customHeaders: {} },
      { message: orphan, detection: orphanDetection, customHeaders: {} },
    ]);

    assert.equal(batch.plans.length, 2, "every selected message appears in the plan");
    assert.equal(batch.executableCount, 1);
    assert.equal(batch.excludedCount, 1);
    assert.deepEqual(batch.executableMessageIds, ["tpm-1"]);
  });
});

describe("operations/recovery RecoveryStrategyResolver", () => {
  it("registers one strategy per enabled framework, in priority order", () => {
    const strategies = resolver.listStrategies();
    assert.deepEqual(
      strategies.map((strategy) => strategy.framework),
      ["JMS_FRAMEWORK", "TPM_V2", "COMMON_IDOC_ROUTER", "IDOC_STATUS_SYNC"],
    );
  });

  it("omits disabled frameworks, so their messages fall through to manual recovery", async () => {
    const withoutTpm = new RecoveryStrategyResolver(
      FRAMEWORKS.map((framework) =>
        framework.id === "TPM_V2" ? { ...framework, enabled: false } : framework,
      ),
    );
    assert.ok(
      !withoutTpm.listStrategies().some((strategy) => strategy.framework === "TPM_V2"),
    );

    const strategy = withoutTpm.resolve({ framework: "TPM_V2" } as FrameworkDetection);
    assert.equal(strategy.framework, "UNKNOWN", "the manual fallback must claim it");
  });

  it("always returns a strategy, even for a framework it has never heard of", () => {
    const empty = new RecoveryStrategyResolver([]);
    const strategy = empty.resolve({ framework: "TPM_V2" } as FrameworkDetection);
    assert.ok(strategy !== undefined);
    assert.equal(strategy.framework, "UNKNOWN");
  });
});
