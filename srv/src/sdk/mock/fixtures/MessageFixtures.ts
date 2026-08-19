import type {
  MessageProcessingLog,
  MessageErrorDetail,
  MessageHeader,
} from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

/**
 * The two literal, fixed bridge-iFlow names a message's correlation chain passes through when it is
 * JMS-queue-retryable (confirmed against the real tenant's naming convention — not a guess). Also
 * exported so the mock fixtures below and the real classification logic in `message-monitoring`
 * agree on the exact same strings.
 */
export const JMS_INGRESS_IFLOW_NAME = "IF_JMS_ingress";
export const JMS_EGRESS_IFLOW_NAME = "IF_JMS_egress";
/** The mock `IF_JMS_ingress` entry's own message id — the fixed anchor for {@link generateCustomHeaders}. */
export const MOCK_JMS_INGRESS_MESSAGE_ID = "msg-jms-bridge-ingress";
export const MOCK_JMS_EGRESS_MESSAGE_ID = "msg-jms-bridge-egress";
export const MOCK_JMS_SOURCE_MESSAGE_ID = "msg-jms-bridge-source";
const MOCK_JMS_BRIDGE_CORRELATION_ID = "corr-jms-bridge-fixture";
/** The mock resolved queue `CH-Message-Queue` points at — mirrors the real header value's literal shape. */
export const MOCK_JMS_RESOLVED_QUEUE = "Common_JMS_ID_Ecom_P1";

/**
 * Framework scenario fixtures (Phase 13). One message per branch the recovery strategies must be able
 * to reach, so every framework's traversal, DLQ mapping and Manual-Investigation fallback is
 * exercisable in mock mode without a live tenant.
 *
 * The TPM entries carry `SAP_TPM_`-shaped integration-flow names so they match the shipped
 * `integrationFlowPatterns` in `config/frameworks.json`. The Common IDoc Router and IDoc Status Sync
 * entries deliberately carry names that match **no** configured rule — those two frameworks ship with
 * no detection rules today, so they are detectable only through queue evidence during *full*
 * detection. That is the honest state of what is known about them, and these fixtures keep the
 * distinction testable rather than papering over it.
 */
export const MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID = "msg-tpm-processing-dlq";
export const MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID = "msg-tpm-receiver-dlq";
export const MOCK_TPM_INBOUND_MESSAGE_ID = "msg-tpm-inbound-active";
export const MOCK_TPM_ORPHAN_MESSAGE_ID = "msg-tpm-not-on-any-queue";
export const MOCK_ROUTER_DLQ_MESSAGE_ID = "msg-router-dlq";
export const MOCK_STATUS_SYNC_DLQ_MESSAGE_ID = "msg-status-sync-dlq";

/** The TPM V2 queue names, mirroring `config/frameworks.json`'s shipped topology. */
export const MOCK_TPM_INBOUND_QUEUE = "SAP_TPM_INBOUND_Q";
export const MOCK_TPM_OUTBOUND_QUEUE = "SAP_TPM_OUTBOUND_Q";
export const MOCK_TPM_PROCESSING_DLQ = "SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q";
export const MOCK_TPM_RECEIVER_DLQ = "SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q";
/** The Common IDoc Router and IDoc Status Sync queue names. */
export const MOCK_ROUTER_QUEUE = "Common_Router_JMS";
export const MOCK_ROUTER_DLQ = "Common_Router_JMS_DLQ";
export const MOCK_STATUS_SYNC_QUEUE = "Status_JMS";
export const MOCK_STATUS_SYNC_DLQ = "Status_JMS_DLQ";

/**
 * Which queue each framework scenario message is parked on, consumed by `QueueFixtures`'
 * `generateSingleMessage`.
 */
export const MOCK_FRAMEWORK_MESSAGE_QUEUES: Readonly<Record<string, string>> = {
  [MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID]: MOCK_TPM_PROCESSING_DLQ,
  [MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID]: MOCK_TPM_RECEIVER_DLQ,
  [MOCK_TPM_INBOUND_MESSAGE_ID]: MOCK_TPM_INBOUND_QUEUE,
  [MOCK_ROUTER_DLQ_MESSAGE_ID]: MOCK_ROUTER_DLQ,
  [MOCK_STATUS_SYNC_DLQ_MESSAGE_ID]: MOCK_STATUS_SYNC_DLQ,
};

/**
 * Scenario messages that must be present on **no** queue at all.
 *
 * Needed because `generateSingleMessage`'s catch-all branch is deterministically pseudo-random
 * (~60% present), which would otherwise place the "detected as TPM V2 but parked nowhere" fixture on
 * a queue by chance and quietly destroy the case it exists to cover — the `NOT_FOUND` /
 * Manual-Investigation path.
 */
export const MOCK_FRAMEWORK_ABSENT_MESSAGE_IDS: ReadonlySet<string> = new Set([
  MOCK_TPM_ORPHAN_MESSAGE_ID,
]);

const FLOWS = [
  "OrderToCash_SalesOrder_IN",
  "Invoice_SupplierInvoice_IN",
  "MaterialMaster_Replication_OUT",
  "CustomerMaster_Sync_OUT",
  "PurchaseOrder_Ack_IN",
  "ShipmentNotification_OUT",
];
const STATUSES = [
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "FAILED",
  "PROCESSING",
  "RETRY",
  "ESCALATED",
];
const SENDERS = ["SAP_S4HANA", "SAP_Ariba", "SAP_SuccessFactors", "PARTNER_EDI_GATEWAY"];
const RECEIVERS = ["SAP_S4HANA", "SFTP_PARTNER_OUT", "SAP_BTP_DESTINATION", "PARTNER_EDI_GATEWAY"];
const MESSAGE_TYPES = ["ORDERS", "INVOIC", "DESADV", "MATMAS", "DEBMAS"];
const APPLICATIONS = ["S4HANA_CLOUD", "ARIBA_NETWORK", "SUCCESSFACTORS", "EDI_GATEWAY"];

/**
 * Generates a deterministic (given `seed`) list of realistic {@link MessageProcessingLog} entries
 * for the mock engine's `MonitoringProvider` implementation.
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated message processing logs, newest first.
 */
export function generateMessageLogs(count: number, seed = 42): MessageProcessingLog[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  const logs = Array.from({ length: count }, (_, index) => {
    const status = rng.pick(STATUSES);
    const startTime = new Date(now - index * 60000 - rng.int(0, 59000)).toISOString();
    const isTerminal = status === "COMPLETED" || status === "FAILED";
    const processingTimeMs = isTerminal ? rng.int(80, 45000) : undefined;
    return {
      messageId: `msg-${(seed * 1000 + index).toString(16)}`,
      correlationId: `corr-${(seed * 1000 + index).toString(16)}`,
      integrationFlow: rng.pick(FLOWS),
      status,
      startTime,
      endTime: isTerminal
        ? new Date(new Date(startTime).getTime() + (processingTimeMs ?? 0)).toISOString()
        : undefined,
      processingTimeMs,
      sender: rng.pick(SENDERS),
      receiver: rng.pick(RECEIVERS),
      customStatus: status === "ESCALATED" ? "MANUAL_REVIEW_REQUIRED" : undefined,
      applicationId: rng.pick(APPLICATIONS),
      messageType: rng.pick(MESSAGE_TYPES),
    };
  });
  if (seed === 42 && count >= 6) {
    applyJmsBridgeFixture(logs);
  }
  if (seed === 42 && count >= 12) {
    applyFrameworkFixtures(logs);
  }
  return logs;
}

/**
 * Deterministically repurposes 3 already-generated slots (indices 3–5) into a coherent JMS-bridge
 * correlation group — a source message plus its `IF_JMS_ingress`/`IF_JMS_egress` bridge-flow log
 * entries, all sharing one correlation id — so mock mode can exercise the real JMS retry-eligibility
 * classification (§ Message Monitoring JMS retry) end to end. Total entry count is unchanged; only
 * the default seed's fixture set carries this scenario, so other seeds stay purely random.
 */
function applyJmsBridgeFixture(logs: MessageProcessingLog[]): void {
  const source = logs[3] as MessageProcessingLog;
  const ingress = logs[4] as MessageProcessingLog;
  const egress = logs[5] as MessageProcessingLog;
  logs[3] = {
    ...source,
    messageId: MOCK_JMS_SOURCE_MESSAGE_ID,
    correlationId: MOCK_JMS_BRIDGE_CORRELATION_ID,
    status: "FAILED",
    customStatus: undefined,
  };
  logs[4] = {
    ...ingress,
    messageId: MOCK_JMS_INGRESS_MESSAGE_ID,
    correlationId: MOCK_JMS_BRIDGE_CORRELATION_ID,
    integrationFlow: JMS_INGRESS_IFLOW_NAME,
    status: "COMPLETED",
    customStatus: undefined,
  };
  logs[5] = {
    ...egress,
    messageId: MOCK_JMS_EGRESS_MESSAGE_ID,
    correlationId: MOCK_JMS_BRIDGE_CORRELATION_ID,
    integrationFlow: JMS_EGRESS_IFLOW_NAME,
    status: "COMPLETED",
    customStatus: undefined,
  };
}

/**
 * Deterministically repurposes 6 already-generated slots (indices 6–11) into the framework scenario
 * messages described on {@link MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID}. Same approach as
 * {@link applyJmsBridgeFixture}: total entry count is unchanged, and only the default seed's fixture
 * set carries these scenarios so other seeds stay purely random.
 *
 * Each message gets its own correlation id — these are single-entry correlation groups, which also
 * makes them the negative case for the JMS framework's correlation-chain rule.
 */
function applyFrameworkFixtures(logs: MessageProcessingLog[]): void {
  const scenarios: readonly {
    readonly index: number;
    readonly messageId: string;
    readonly integrationFlow: string;
  }[] = [
    {
      index: 6,
      messageId: MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
      integrationFlow: "SAP_TPM_COM_OutboundProcessing",
    },
    {
      index: 7,
      messageId: MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
      integrationFlow: "SAP_TPM_COM_ReceiverOutbound",
    },
    {
      index: 8,
      messageId: MOCK_TPM_INBOUND_MESSAGE_ID,
      integrationFlow: "SAP_TPM_Inbound_Handler",
    },
    {
      index: 9,
      messageId: MOCK_TPM_ORPHAN_MESSAGE_ID,
      integrationFlow: "SAP_TPM_Inbound_Handler",
    },
    // No configured detection rule matches these two names — queue evidence is their only signal.
    { index: 10, messageId: MOCK_ROUTER_DLQ_MESSAGE_ID, integrationFlow: "IDoc_Router_Dispatch" },
    {
      index: 11,
      messageId: MOCK_STATUS_SYNC_DLQ_MESSAGE_ID,
      integrationFlow: "IDoc_Status_Update_997",
    },
  ];

  for (const scenario of scenarios) {
    const base = logs[scenario.index] as MessageProcessingLog;
    logs[scenario.index] = {
      ...base,
      messageId: scenario.messageId,
      correlationId: `corr-${scenario.messageId}`,
      integrationFlow: scenario.integrationFlow,
      status: "FAILED",
      customStatus: undefined,
    };
  }
}

const ERROR_TEXTS = [
  "Connection to receiver system timed out after 30000ms.",
  "Mapping failure: required field 'PurchaseOrderNumber' is missing.",
  "HTTP 503 received from downstream endpoint.",
  "XML validation failed against configured schema.",
];

/**
 * Generates realistic {@link MessageErrorDetail} entries for a failed message.
 * @param messageId the message id the details belong to.
 * @param seed PRNG seed for reproducibility.
 * @returns one to two error detail entries.
 */
export function generateErrorDetails(messageId: string, seed = 42): MessageErrorDetail[] {
  const rng = new SeededRandom(seed);
  const count = rng.int(1, 2);
  return Array.from({ length: count }, () => ({
    messageId,
    text: rng.pick(ERROR_TEXTS),
    category: rng.chance(0.5) ? "TECHNICAL" : "FUNCTIONAL",
  }));
}

/**
 * Generates a message's custom headers. The {@link MOCK_JMS_INGRESS_MESSAGE_ID} entry carries a
 * realistic `CH-Message-Queue` header value — the exact literal format confirmed against the real
 * tenant (`📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = <queue>]`) —
 * so mock mode can exercise the same header-parsing regex the real provider's data does. Every other
 * message gets a couple of generic, deterministic headers (one `SAP_`-prefixed, to exercise
 * `HeaderEngine`'s standard/custom split).
 * @param messageId the message id the headers belong to.
 * @param seed PRNG seed for reproducibility.
 * @returns the generated custom header entries.
 */
export function generateCustomHeaders(messageId: string, seed = 42): MessageHeader[] {
  if (messageId === MOCK_JMS_INGRESS_MESSAGE_ID) {
    return [
      {
        name: "CH-Message-Queue",
        value: `📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = ${MOCK_JMS_RESOLVED_QUEUE}]`,
      },
      { name: "SAP_ApplicationErrorCategory", value: "NONE" },
    ];
  }
  const rng = new SeededRandom(seed);
  return [
    { name: "SAP_MessageProcessingLogID", value: messageId },
    { name: "X-Custom-Origin", value: rng.pick(["EDI_GATEWAY", "S4HANA_CLOUD", "ARIBA_NETWORK"]) },
  ];
}
