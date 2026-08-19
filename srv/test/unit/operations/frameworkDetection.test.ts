import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FrameworkDetectionEngine } from "../../../src/operations/engines/FrameworkDetectionEngine.js";
import { frameworksSchema, type FrameworkConfig } from "../../../src/config/schemas/index.js";
import type { MessageSummary } from "../../../src/operations/dto/index.js";

/**
 * Framework detection (Phase 13, §1). Every case here drives the engine through a *configuration*,
 * never a hardcoded framework name — the whole point of the design is that detection rules are data.
 */

/** The shipped configuration, parsed through the real schema so tests and boot agree on defaults. */
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
          "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q",
        ],
        activeQueues: ["SAP_TPM_INBOUND_Q"],
        deadLetterQueues: ["SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"],
        dlqRecoveryMap: {
          SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q: "SAP_TPM_INBOUND_Q",
        },
      },
    },
    {
      id: "COMMON_IDOC_ROUTER",
      label: "Common IDoc Router",
      priority: 3,
      // No detect rules at all — queue evidence is this framework's only signal today.
      topology: {
        traversalOrder: ["Common_Router_JMS", "Common_Router_JMS_DLQ"],
        activeQueues: ["Common_Router_JMS"],
        deadLetterQueues: ["Common_Router_JMS_DLQ"],
        dlqRecoveryMap: { Common_Router_JMS_DLQ: "Common_Router_JMS" },
      },
    },
  ],
}).frameworks;

function message(overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    messageId: "msg-1",
    correlationId: "corr-1",
    integrationFlow: "Some_Unrelated_Flow",
    status: "FAILED",
    humanReadableStatus: "Failed",
    severity: "error",
    startTime: new Date().toISOString(),
    endTime: undefined,
    processingTimeMs: 100,
    processingTimeHuman: "100 ms",
    sender: "S",
    receiver: "R",
    applicationId: undefined,
    messageType: undefined,
    customStatus: undefined,
    ...overrides,
  };
}

/** A probe that reports the message present on exactly one queue. */
function probeOn(queueName: string) {
  return async (candidate: string): Promise<boolean> => candidate === queueName;
}

const probeNowhere = async (): Promise<boolean> => false;

describe("operations/FrameworkDetectionEngine.detectCheap", () => {
  it("confirms the JMS framework from the correlation chain's bridge flows", () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message();
    const detection = engine.detectCheap(source, [
      source,
      message({ messageId: "in", integrationFlow: "IF_JMS_ingress" }),
      message({ messageId: "eg", integrationFlow: "IF_JMS_egress" }),
    ]);

    assert.equal(detection.framework, "JMS_FRAMEWORK");
    assert.equal(detection.confidence, "confirmed");
    assert.equal(detection.matchedRule, "JMS_FRAMEWORK.correlationFlowNames");
  });

  it("does not confirm the JMS framework when only one bridge flow is present", () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message();
    const detection = engine.detectCheap(source, [
      source,
      message({ messageId: "in", integrationFlow: "IF_JMS_ingress" }),
    ]);

    assert.notEqual(detection.framework, "JMS_FRAMEWORK");
    const jmsEvidence = detection.evidence.find(
      (entry) => entry.rule === "JMS_FRAMEWORK.correlationFlowNames",
    );
    assert.ok(jmsEvidence !== undefined && !jmsEvidence.matched);
    assert.match(jmsEvidence.outcome, /IF_JMS_egress/);
  });

  it("matches TPM V2 on an integration-flow name pattern, at probable confidence only", () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_COM_OutboundProcessing" });
    const detection = engine.detectCheap(source, [source]);

    assert.equal(detection.framework, "TPM_V2");
    assert.equal(
      detection.confidence,
      "probable",
      "a name-shape match is indirect evidence and must never be reported as confirmed",
    );
    assert.equal(detection.matchedRule, "TPM_V2.integrationFlowPatterns");
  });

  it("leaves a queue-topology-only framework unresolved at list scope", () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    // A Common IDoc Router message: no configured rule can match it without probing queues.
    const source = message({ integrationFlow: "IDoc_Router_Dispatch" });
    const detection = engine.detectCheap(source, [source]);

    assert.notEqual(detection.framework, "COMMON_IDOC_ROUTER");
    assert.equal(detection.confidence, "none");
    assert.equal(detection.detectedQueue, undefined, "cheap detection never probes a queue");
  });

  it("records evidence for every rule that ran, including the ones that did not match", () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message();
    const detection = engine.detectCheap(source, [source]);

    assert.ok(detection.evidence.length > 0, "an unmatched result must still explain itself");
    assert.ok(detection.evidence.every((entry) => typeof entry.outcome === "string"));
    assert.ok(detection.evidence.some((entry) => !entry.matched));
  });

  it("reports UNKNOWN rather than a framework when no rule can be evaluated at all", () => {
    const engine = new FrameworkDetectionEngine([]);
    const source = message();
    const detection = engine.detectCheap(source, [source]);

    assert.equal(detection.framework, "UNKNOWN");
    assert.equal(detection.confidence, "none");
    assert.equal(detection.matchedRule, undefined);
    assert.deepEqual(detection.evidence, []);
  });

  it("skips disabled frameworks entirely", () => {
    const disabled = FRAMEWORKS.map((framework) =>
      framework.id === "TPM_V2" ? { ...framework, enabled: false } : framework,
    ).filter((framework) => framework.enabled);
    const engine = new FrameworkDetectionEngine(disabled);
    const source = message({ integrationFlow: "SAP_TPM_COM_OutboundProcessing" });
    const detection = engine.detectCheap(source, [source]);

    assert.notEqual(detection.framework, "TPM_V2");
    assert.ok(detection.evidence.every((entry) => !entry.rule.startsWith("TPM_V2")));
  });
});

describe("operations/FrameworkDetectionEngine.detectFull", () => {
  it("resolves a queue-topology-only framework from real queue evidence", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "IDoc_Router_Dispatch" });
    const detection = await engine.detectFull(
      source,
      [source],
      {},
      probeOn("Common_Router_JMS_DLQ"),
    );

    assert.equal(detection.framework, "COMMON_IDOC_ROUTER");
    assert.equal(detection.confidence, "confirmed", "being on the queue is direct evidence");
    assert.equal(detection.detectedQueue, "Common_Router_JMS_DLQ");
    assert.equal(detection.queueRole, "DLQ");
  });

  it("marks an active queue as MAIN, not DLQ", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_Inbound_Handler" });
    const detection = await engine.detectFull(source, [source], {}, probeOn("SAP_TPM_INBOUND_Q"));

    assert.equal(detection.framework, "TPM_V2");
    assert.equal(detection.queueRole, "MAIN");
    assert.equal(detection.detectedQueue, "SAP_TPM_INBOUND_Q");
  });

  it("upgrades a probable name match to confirmed when queue evidence corroborates it", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_COM_OutboundProcessing" });

    const cheap = engine.detectCheap(source, [source]);
    assert.equal(cheap.confidence, "probable");

    const full = await engine.detectFull(
      source,
      [source],
      {},
      probeOn("SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"),
    );
    assert.equal(full.framework, "TPM_V2");
    assert.equal(full.confidence, "confirmed");
    const corroboration = full.evidence.find((entry) => entry.rule === "TPM_V2.queueTopology");
    assert.ok(corroboration !== undefined && corroboration.matched);
    assert.match(corroboration.outcome, /corroborat/i);
  });

  it("keeps a probable name match when the message is on no queue at all", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_Inbound_Handler" });
    const detection = await engine.detectFull(source, [source], {}, probeNowhere);

    assert.equal(detection.framework, "TPM_V2", "the flow-name evidence still stands");
    assert.equal(detection.confidence, "probable");
    assert.equal(detection.detectedQueue, undefined, "no location is claimed without evidence");
    assert.ok(
      detection.evidence.some(
        (entry) => entry.rule === "TPM_V2.queueTopology" && !entry.matched,
      ),
      "the failed queue search must be recorded",
    );
  });

  it("derives a move-then-retry path for a message found on a dead-letter queue", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_COM_OutboundProcessing" });
    const detection = await engine.detectFull(
      source,
      [source],
      {},
      probeOn("SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q"),
    );

    const path = detection.possibleRecoveryPath;
    assert.ok(path !== undefined);
    assert.deepEqual(
      path.map((step) => step.action),
      ["LOCATED", "MOVE", "VERIFY", "RETRY"],
    );
    assert.equal(path[1]?.queueName, "SAP_TPM_INBOUND_Q");
  });

  it("derives a retry-in-place path for a message found on an active queue", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ integrationFlow: "SAP_TPM_Inbound_Handler" });
    const detection = await engine.detectFull(source, [source], {}, probeOn("SAP_TPM_INBOUND_Q"));

    assert.deepEqual(
      detection.possibleRecoveryPath?.map((step) => step.action),
      ["LOCATED", "RETRY"],
    );
  });

  it("carries the source mpl id and correlation id through every result", async () => {
    const engine = new FrameworkDetectionEngine(FRAMEWORKS);
    const source = message({ messageId: "mpl-42", correlationId: "corr-42" });
    const detection = await engine.detectFull(source, [source], {}, probeNowhere);

    assert.equal(detection.sourceMplId, "mpl-42");
    assert.equal(detection.correlationId, "corr-42");
  });
});
