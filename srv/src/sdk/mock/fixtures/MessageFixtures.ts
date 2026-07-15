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
