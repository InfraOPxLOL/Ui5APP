import type {
  JmsMessagePayload,
  MessageHeader,
  MessageProcessingLog,
  QueuedMessage,
} from "../../../core/providers/types.js";

/**
 * Non-B2B mock transactions (mock mode only): business messages that pass through the Common IDoc
 * Router and/or the JMS framework before reaching their business flow, using the real flow names,
 * queue header and queues from `config/frameworks.json`.
 *
 * Every case the Report Server and Failed Transactions must handle has one:
 * delivered through Router + JMS, delivered through JMS only, a plain business flow, a JMS message
 * still retrying, JMS dead-letter messages whose queue is known from the ingress header / from the
 * queue consumer flow / from neither (the operator picks), and router messages that failed on a
 * Partner Directory lookup and sit on the router DLQ.
 */

/** The JMS framework's central dead-letter queue. */
export const MOCK_JMS_DLQ = "Common_JMS_ID_DLQ";
/** The router's dead-letter queue and the processing queue a retried router message returns to. */
export const MOCK_ROUTER_DEAD_LETTER_QUEUE = "Common_JMS_ID_Router_DLQ";
export const MOCK_ROUTER_PROCESSING_QUEUE = "Common_JMS_ID_Common_Router";

const ROUTER_RFC = "IF_FM_Core_IDoc_Router_RFC-ID_BTP_IS_CORE_";
const ROUTER_MAIN = "IF_FM_Core_IDoc_Router_Main";
const JMS_INGRESS = "IF_FM_Core_JMS_Step-3_Ingress_Dispatcher";
const JMS_CONSUMER = "IF_FM_Core_JMS_Step-3_Queue_Consumer_";
const JMS_EGRESS = "IF_FM_Core_JMS_Step-6_Egress_Dispatcher";

interface ScenarioStep {
  readonly flow: string;
  readonly status: string;
}

/** One non-B2B transaction. */
export interface NonB2bScenario {
  readonly key: string;
  readonly correlationId: string;
  /** When the first step started. */
  readonly minutesAgo: number;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId: string;
  readonly messageType: string;
  readonly steps: readonly ScenarioStep[];
  /** The queue the ingress dispatcher's header names; absent = the header was not written. */
  readonly queueHeader?: string;
  /** The message parked on a dead-letter queue, when the transaction ended there. */
  readonly parked?: {
    readonly queueName: string;
    readonly jmsMessageId: string;
    readonly retryCount: number;
    /** The step whose processing log the parked message carries. */
    readonly mplStep: number;
  };
}

function consumerRuns(region: string, status: string, times: number): ScenarioStep[] {
  return Array.from({ length: times }, () => ({ flow: `${JMS_CONSUMER}${region}`, status }));
}

export const NON_B2B_SCENARIOS: readonly NonB2bScenario[] = [
  {
    key: "nb-router-jms-ok",
    correlationId: "corr-nb-router-jms-ok",
    minutesAgo: 12,
    sender: "S4_LA",
    receiver: "SFDC",
    applicationId: "0000481516",
    messageType: "ORDERS05",
    queueHeader: "Common_JMS_ID_NA_P1",
    steps: [
      { flow: `${ROUTER_RFC}LA`, status: "COMPLETED" },
      { flow: ROUTER_MAIN, status: "COMPLETED" },
      { flow: JMS_INGRESS, status: "COMPLETED" },
      ...consumerRuns("NA_P1", "COMPLETED", 1),
      { flow: JMS_EGRESS, status: "COMPLETED" },
      { flow: "IF_Order_to_SFDC", status: "COMPLETED" },
    ],
  },
  {
    key: "nb-jms-ok",
    correlationId: "corr-nb-jms-ok",
    minutesAgo: 35,
    sender: "S4",
    receiver: "COUPA",
    applicationId: "9000123456",
    messageType: "INVOIC02",
    queueHeader: "Common_JMS_ID_EU_P2",
    steps: [
      { flow: JMS_INGRESS, status: "COMPLETED" },
      ...consumerRuns("Europe_P2", "COMPLETED", 1),
      { flow: JMS_EGRESS, status: "COMPLETED" },
      { flow: "IF_Invoice_to_Coupa", status: "COMPLETED" },
    ],
  },
  {
    key: "nb-plain-ok",
    correlationId: "corr-nb-plain-ok",
    minutesAgo: 50,
    sender: "S4",
    receiver: "MDG",
    applicationId: "MAT-100234",
    messageType: "MATMAS05",
    steps: [{ flow: "IF_Material_Sync", status: "COMPLETED" }],
  },
  {
    key: "nb-router-hills-ok",
    correlationId: "corr-nb-router-hills-ok",
    minutesAgo: 75,
    sender: "S4_HU",
    receiver: "HILLS_SFTP",
    applicationId: "0000481700",
    messageType: "DESADV01",
    queueHeader: "Common_JMS_ID_Hills_P1",
    steps: [
      { flow: `${ROUTER_RFC}HU`, status: "COMPLETED" },
      { flow: ROUTER_MAIN, status: "COMPLETED" },
      { flow: JMS_INGRESS, status: "COMPLETED" },
      ...consumerRuns("Hills_P1", "COMPLETED", 1),
      { flow: JMS_EGRESS, status: "COMPLETED" },
      { flow: "IF_Hills_Shipment_Notice", status: "COMPLETED" },
    ],
  },
  {
    key: "nb-plain-failed",
    correlationId: "corr-nb-plain-failed",
    minutesAgo: 95,
    sender: "S4",
    receiver: "MDG",
    applicationId: "MAT-100299",
    messageType: "MATMAS05",
    steps: [{ flow: "IF_Material_Sync", status: "FAILED" }],
  },
  {
    key: "nb-jms-retrying",
    correlationId: "corr-nb-jms-retrying",
    minutesAgo: 20,
    sender: "S4",
    receiver: "WMS_EU",
    applicationId: "0080001122",
    messageType: "SHPORD",
    queueHeader: "Common_JMS_ID_Generic_P2",
    steps: [{ flow: JMS_INGRESS, status: "COMPLETED" }, ...consumerRuns("Generic_P2", "RETRY", 2)],
  },
  {
    key: "nb-jms-dlq-header",
    correlationId: "corr-nb-jms-dlq-header",
    minutesAgo: 140,
    sender: "S4_CC",
    receiver: "SFDC_LATAM",
    applicationId: "0000482001",
    messageType: "ORDERS05",
    queueHeader: "Common_JMS_ID_LATAM_P1",
    steps: [
      { flow: `${ROUTER_RFC}CC`, status: "COMPLETED" },
      { flow: ROUTER_MAIN, status: "COMPLETED" },
      { flow: JMS_INGRESS, status: "COMPLETED" },
      ...consumerRuns("LATAM_P1", "FAILED", 3),
    ],
    parked: {
      queueName: MOCK_JMS_DLQ,
      jmsMessageId: "ID:nb-jms-dlq-header",
      retryCount: 5,
      mplStep: 5,
    },
  },
  {
    key: "nb-jms-dlq-consumer",
    correlationId: "corr-nb-jms-dlq-consumer",
    minutesAgo: 180,
    sender: "S4",
    receiver: "ARIBA_AS",
    applicationId: "4500991234",
    messageType: "ORDRSP",
    // The ingress dispatcher wrote no queue header: the consumer flow is the only clue.
    steps: [{ flow: JMS_INGRESS, status: "COMPLETED" }, ...consumerRuns("Asia_P2", "FAILED", 2)],
    parked: {
      queueName: MOCK_JMS_DLQ,
      jmsMessageId: "ID:nb-jms-dlq-consumer",
      retryCount: 5,
      mplStep: 2,
    },
  },
  {
    key: "nb-jms-dlq-unresolved",
    correlationId: "corr-nb-jms-dlq-unresolved",
    minutesAgo: 260,
    sender: "S4",
    receiver: "LEGACY_FTP",
    applicationId: "0000470001",
    messageType: "FIDCC2",
    // Neither the header nor a consumer run survives: the operator must choose the queue.
    steps: [{ flow: JMS_INGRESS, status: "COMPLETED" }],
    parked: {
      queueName: MOCK_JMS_DLQ,
      jmsMessageId: "ID:nb-jms-dlq-unresolved",
      retryCount: 5,
      mplStep: 0,
    },
  },
  {
    key: "nb-jms-dlq-na",
    correlationId: "corr-nb-jms-dlq-na",
    minutesAgo: 320,
    sender: "S4",
    receiver: "SFDC",
    applicationId: "0000469050",
    messageType: "ORDERS05",
    queueHeader: "Common_JMS_ID_NA_P3",
    steps: [{ flow: JMS_INGRESS, status: "COMPLETED" }, ...consumerRuns("NA_P3", "FAILED", 4)],
    parked: {
      queueName: MOCK_JMS_DLQ,
      jmsMessageId: "ID:nb-jms-dlq-na",
      retryCount: 5,
      mplStep: 4,
    },
  },
  {
    key: "nb-router-dlq-la",
    correlationId: "corr-nb-router-dlq-la",
    minutesAgo: 110,
    sender: "S4_LA",
    receiver: "",
    applicationId: "0000482555",
    messageType: "ORDERS05",
    steps: [
      { flow: `${ROUTER_RFC}LA`, status: "COMPLETED" },
      { flow: ROUTER_MAIN, status: "FAILED" },
    ],
    parked: {
      queueName: MOCK_ROUTER_DEAD_LETTER_QUEUE,
      jmsMessageId: "ID:nb-router-dlq-la",
      retryCount: 3,
      mplStep: 1,
    },
  },
  {
    key: "nb-router-dlq-hu",
    correlationId: "corr-nb-router-dlq-hu",
    minutesAgo: 230,
    sender: "S4_HU",
    receiver: "",
    applicationId: "0000482600",
    messageType: "DESADV01",
    steps: [
      { flow: `${ROUTER_RFC}HU`, status: "COMPLETED" },
      { flow: ROUTER_MAIN, status: "FAILED" },
    ],
    parked: {
      queueName: MOCK_ROUTER_DEAD_LETTER_QUEUE,
      jmsMessageId: "ID:nb-router-dlq-hu",
      retryCount: 3,
      mplStep: 1,
    },
  },
];

/** The processing log id of a scenario step. */
export function nonB2bStepMplId(scenario: NonB2bScenario, step: number): string {
  return `${scenario.key}-s${step}`;
}

/** Every processing log of every scenario, newest first. Steps are a minute apart. */
export function generateNonB2bRuns(now = Date.now()): MessageProcessingLog[] {
  const runs: MessageProcessingLog[] = [];
  for (const scenario of NON_B2B_SCENARIOS) {
    const start = now - scenario.minutesAgo * 60_000;
    scenario.steps.forEach((step, index) => {
      const begin = start + index * 60_000;
      const isBusiness = !step.flow.startsWith("IF_FM_Core_");
      const isRouterInbound = step.flow.startsWith(ROUTER_RFC);
      runs.push({
        messageId: nonB2bStepMplId(scenario, index),
        correlationId: scenario.correlationId,
        integrationFlow: step.flow,
        status: step.status,
        startTime: new Date(begin).toISOString(),
        endTime: new Date(begin + 1_800).toISOString(),
        processingTimeMs: 1_800,
        sender: isBusiness || isRouterInbound ? scenario.sender : "",
        receiver: isBusiness ? scenario.receiver : "",
        customStatus: undefined,
        applicationId: scenario.applicationId,
        messageType: scenario.messageType,
        senderInterchangeControl: undefined,
        receiverInterchangeControl: undefined,
        businessRole: undefined,
      });
    });
  }
  return runs.sort((a, b) => b.startTime.localeCompare(a.startTime));
}

/** The custom headers of a scenario's JMS ingress dispatcher run, or `undefined` for other ids. */
export function nonB2bCustomHeaders(messageId: string): MessageHeader[] | undefined {
  for (const scenario of NON_B2B_SCENARIOS) {
    const index = scenario.steps.findIndex((step) => step.flow === JMS_INGRESS);
    if (index >= 0 && nonB2bStepMplId(scenario, index) === messageId) {
      return scenario.queueHeader === undefined
        ? [{ name: "SAP_ApplicationErrorCategory", value: "NONE" }]
        : [
            {
              name: "CH-Message-Log-QueueResolution",
              value: `📂 [PD Fetch] Queue resolved via Direct Value [QUEUE_JMS_${scenario.messageType} = ${scenario.queueHeader}]`,
            },
          ];
    }
  }
  return undefined;
}

/** The scenario whose parked JMS message has this id. */
export function findNonB2bParkedScenario(jmsMessageId: string): NonB2bScenario | undefined {
  return NON_B2B_SCENARIOS.find((scenario) => scenario.parked?.jmsMessageId === jmsMessageId);
}

/** A scenario's parked message as the broker reports it on `queueName`. */
export function nonB2bQueuedMessage(
  scenario: NonB2bScenario,
  queueName: string,
  now = Date.now(),
): QueuedMessage {
  const parked = scenario.parked as NonNullable<NonB2bScenario["parked"]>;
  const lastStep = scenario.steps.length - 1;
  return {
    messageId: parked.jmsMessageId,
    queueName,
    enqueuedAt: new Date(
      now - scenario.minutesAgo * 60_000 + lastStep * 60_000 + 2_000,
    ).toISOString(),
    retryCount: parked.retryCount,
    sizeBytes: 2_048,
    failed: true,
    mplId: nonB2bStepMplId(scenario, parked.mplStep),
    correlationId: scenario.correlationId,
    sender: scenario.sender,
    receiver: scenario.receiver === "" ? undefined : scenario.receiver,
    messageType: scenario.messageType,
    applicationId: scenario.applicationId,
  };
}

/** The body of a scenario's parked message: a small IDoc document. */
export function nonB2bPayload(scenario: NonB2bScenario): JmsMessagePayload {
  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${scenario.messageType}>`,
    '  <IDOC BEGIN="1">',
    '    <EDI_DC40 SEGMENT="1">',
    `      <DOCNUM>${scenario.applicationId}</DOCNUM>`,
    `      <SNDPRN>${scenario.sender}</SNDPRN>`,
    `      <RCVPRN>${scenario.receiver === "" ? "UNKNOWN" : scenario.receiver}</RCVPRN>`,
    `      <MESTYP>${scenario.messageType}</MESTYP>`,
    "    </EDI_DC40>",
    "  </IDOC>",
    `</${scenario.messageType}>`,
  ].join("\n");
  return { content, encoding: "text", sizeBytes: Buffer.byteLength(content, "utf8") };
}
