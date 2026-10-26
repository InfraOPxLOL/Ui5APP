import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TransactionAnalyzer } from "../../../src/operations/transactions/TransactionAnalyzer.js";
import { frameworksSchema } from "../../../src/config/schemas/index.js";
import type { MessageSummary } from "../../../src/operations/dto/index.js";
import {
  humanReadableStatus,
  severityOfStatus,
  formatDurationHuman,
} from "../../../src/operations/transform/index.js";

/** The real configuration — these tests pin the behaviour the operators rely on. */
const FRAMEWORKS = frameworksSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../config/frameworks.json", import.meta.url)),
      "utf8",
    ),
  ),
).frameworks;

const analyzer = new TransactionAnalyzer(FRAMEWORKS);

let clock = Date.UTC(2026, 9, 26, 8, 0, 0);
function run(
  integrationFlow: string,
  status = "COMPLETED",
  extra: Partial<MessageSummary> = {},
): MessageSummary {
  clock += 60_000;
  return {
    messageId: `mpl-${clock}`,
    correlationId: "corr-1",
    integrationFlow,
    status,
    humanReadableStatus: humanReadableStatus(status),
    severity: severityOfStatus(status),
    startTime: new Date(clock).toISOString(),
    endTime: new Date(clock + 2000).toISOString(),
    processingTimeMs: 2000,
    processingTimeHuman: formatDurationHuman(2000),
    sender: "",
    receiver: "",
    applicationId: undefined,
    messageType: undefined,
    customStatus: undefined,
    senderInterchangeControl: undefined,
    receiverInterchangeControl: undefined,
    businessRole: undefined,
    ...extra,
  };
}

const QUEUE_HEADER = {
  "CH-Message-Log-QueueResolution":
    "📂 [PD Fetch] Queue resolved via Direct Value [QUEUE_JMS_SFDC_Orders = Common_JMS_ID_NA_P1]",
};

describe("operations/transactions/TransactionAnalyzer", () => {
  it("folds a Common Router + JMS chain into one delivered transaction", () => {
    const chain = [
      run("IF_FM_Core_IDoc_Router_RFC-ID_BTP_IS_CORE_LA", "COMPLETED", { sender: "S4_LA" }),
      run("IF_FM_Core_IDoc_Router_Main"),
      run("IF_FM_Core_JMS_Step-3_Ingress_Dispatcher"),
      run("IF_FM_Core_JMS_Step-3_Queue_Consumer_NA_P1"),
      run("IF_FM_Core_JMS_Step-6_Egress_Dispatcher"),
      run("IF_Order_to_SFDC", "COMPLETED", {
        sender: "S4",
        receiver: "SFDC",
        applicationId: "4711",
      }),
    ];
    const txn = analyzer.analyze([...chain].reverse(), QUEUE_HEADER);

    assert.ok(txn !== undefined);
    assert.equal(txn.businessFlow, "IF_Order_to_SFDC");
    assert.equal(txn.statusCategory, "success");
    assert.equal(txn.sender, "S4");
    assert.equal(txn.receiver, "SFDC");
    assert.equal(txn.applicationId, "4711");
    assert.deepEqual(txn.frameworks, ["COMMON_IDOC_ROUTER", "JMS_FRAMEWORK"]);
    assert.deepEqual(txn.path, [
      "Common IDoc Router (BTP_IS_CORE_LA)",
      "JMS · Common_JMS_ID_NA_P1",
      "IF_Order_to_SFDC",
    ]);
    assert.equal(txn.router?.stage, "routed");
    assert.equal(txn.router?.queue, "Common_JMS_ID_Common_Router");
    assert.equal(txn.router?.deadLetterQueue, "Common_JMS_ID_Router_DLQ");
    assert.equal(txn.jms?.stage, "delivered");
    assert.equal(txn.jms?.queue, "Common_JMS_ID_NA_P1");
    assert.equal(txn.jms?.queueSource, "header");
    assert.equal(txn.jms?.deadLetterQueue, "Common_JMS_ID_DLQ");
    assert.deepEqual(
      txn.steps.map((step) => step.label),
      [
        "Router inbound (BTP_IS_CORE_LA)",
        "Router main",
        "JMS ingress",
        "JMS queue consumer (NA_P1)",
        "JMS egress",
        "IF_Order_to_SFDC",
      ],
    );
    assert.deepEqual(
      txn.steps.map((step) => step.role),
      ["framework", "framework", "framework", "framework", "framework", "business"],
    );
  });

  it("falls back to the consumer flow table when the queue header is missing", () => {
    const txn = analyzer.analyze([
      run("IF_FM_Core_JMS_Step-3_Ingress_Dispatcher"),
      run("IF_FM_Core_JMS_Step-3_Queue_Consumer_Asia_P2", "RETRY"),
    ]);
    assert.equal(txn?.jms?.queue, "Common_JMS_ID_AS_P2");
    assert.equal(txn?.jms?.queueSource, "consumerFlow");
    assert.equal(txn?.jms?.stage, "retrying");
    assert.equal(txn?.statusCategory, "inProgress", "the business flow has not run yet");
    assert.equal(txn?.businessFlow, undefined);
  });

  it("reports a consumer that stopped retrying as failed", () => {
    const txn = analyzer.analyze([
      run("IF_FM_Core_JMS_Step-3_Ingress_Dispatcher"),
      run("IF_FM_Core_JMS_Step-3_Queue_Consumer_Europe_P1", "FAILED"),
    ]);
    assert.equal(txn?.jms?.stage, "failed");
    assert.equal(txn?.statusCategory, "error");
  });

  it("leaves the queue unresolved rather than guessing", () => {
    const txn = analyzer.analyze([run("IF_FM_Core_JMS_Step-3_Ingress_Dispatcher")]);
    assert.equal(txn?.jms?.queue, undefined);
    assert.equal(txn?.jms?.stage, "queued");
    assert.deepEqual(txn?.path, ["JMS"]);
  });

  it("refuses to pick between two different consumer queues", () => {
    assert.equal(
      analyzer.resolveJmsQueue(
        [
          "IF_FM_Core_JMS_Step-3_Queue_Consumer_NA_P1",
          "IF_FM_Core_JMS_Step-3_Queue_Consumer_EU_P1",
        ],
        undefined,
      )?.queue,
      "Common_JMS_ID_NA_P1",
      "an unknown consumer name is simply ignored",
    );
    assert.equal(
      analyzer.resolveJmsQueue(
        [
          "IF_FM_Core_JMS_Step-3_Queue_Consumer_NA_P1",
          "IF_FM_Core_JMS_Step-3_Queue_Consumer_Hills_P2",
        ],
        undefined,
      ),
      undefined,
    );
  });

  it("prefers the header over the consumer flow", () => {
    assert.deepEqual(
      analyzer.resolveJmsQueue(["IF_FM_Core_JMS_Step-3_Queue_Consumer_Asia_P1"], QUEUE_HEADER),
      { queue: "Common_JMS_ID_NA_P1", source: "header" },
    );
  });

  it("marks a router that failed before reaching JMS (the Router DLQ case)", () => {
    const txn = analyzer.analyze([
      run("IF_FM_Core_IDoc_Router_RFC-ID_BTP_IS_CORE_HU"),
      run("IF_FM_Core_IDoc_Router_Main", "FAILED"),
    ]);
    assert.equal(txn?.router?.stage, "failed");
    assert.equal(txn?.router?.inbound, "BTP_IS_CORE_HU");
    assert.equal(txn?.statusCategory, "error");
    assert.equal(txn?.jms, undefined);
    assert.equal(txn?.headline.label, "Router main");
  });

  it("treats a flow outside every framework as a plain business transaction", () => {
    const txn = analyzer.analyze([
      run("IF_Material_Sync", "FAILED", { sender: "S4", receiver: "MDG" }),
    ]);
    assert.deepEqual(txn?.frameworks, []);
    assert.deepEqual(txn?.path, ["IF_Material_Sync"]);
    assert.equal(txn?.statusCategory, "error");
  });

  it("recognises TPM flows as B2B and lists the JMS processing queues", () => {
    assert.ok(analyzer.isB2bFlow("SAP_TPM_COM_OutboundProcessing"));
    assert.ok(!analyzer.isB2bFlow("IF_Order_to_SFDC"));
    const queues = analyzer.jmsProcessingQueues();
    assert.equal(queues.length, 20);
    assert.ok(queues.includes("Common_JMS_ID_Generic_P5"));
    assert.ok(queues.includes("Common_JMS_ID_LATAM_P3"));
  });

  it("finds the ingress dispatcher whose headers carry the queue", () => {
    const ingress = run("IF_FM_Core_JMS_Step-3_Ingress_Dispatcher");
    const chain = [run("IF_FM_Core_IDoc_Router_Main"), ingress, run("IF_Order_to_SFDC")];
    assert.equal(analyzer.jmsHeaderStep(chain)?.messageId, ingress.messageId);
  });
});
