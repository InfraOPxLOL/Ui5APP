import type { MessageProcessingLog } from "../../../core/providers/types.js";
import {
  MOCK_TPM_PROCESSING_DLQ,
  MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
  MOCK_TPM_RECEIVER_DLQ,
  MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
} from "./MessageFixtures.js";

/**
 * One failed TPM transaction parked on a dead-letter queue. The single source of truth that the JMS,
 * monitoring and B2B fixtures all derive from, so a DLQ message, its processing runs and its B2B
 * interchange agree in mock mode exactly as they would on a real tenant.
 */
export interface TpmDlqScenario {
  /** JMS message id. In these fixtures it equals the latest run's MPL id. */
  readonly jmsMessageId: string;
  readonly queueName: string;
  readonly mplId: string;
  readonly correlationId: string;
  readonly interchangeId: string;
  readonly senderPartner: string;
  readonly receiverPartner: string;
  readonly documentStandard: string;
  readonly messageType: string;
  readonly controlNumber: string;
  readonly integrationFlow: string;
  readonly minutesAgo: number;
  readonly jmsRetryCount: number;
  /** Earlier processing runs that also failed and landed back on the DLQ. */
  readonly priorRuns: number;
  readonly errorText: string;
}

const PROCESSING_FLOW = "SAP_TPM_COM_OutboundProcessing";
const RECEIVER_FLOW = "SAP_TPM_COM_ReceiverOutbound";

export const MOCK_OWN_COMPANY = "MiddlewareOps US";

export const TPM_DLQ_SCENARIOS: readonly TpmDlqScenario[] = [
  {
    jmsMessageId: MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
    queueName: MOCK_TPM_PROCESSING_DLQ,
    mplId: MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
    correlationId: `corr-${MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID}`,
    interchangeId: "40f83297bb48e5953b421d860b04dac1",
    senderPartner: "AMAZONJP (Hills)",
    receiverPartner: MOCK_OWN_COMPANY,
    documentStandard: "ASC-X12",
    messageType: "850",
    controlNumber: "000010812",
    integrationFlow: PROCESSING_FLOW,
    minutesAgo: 35,
    jmsRetryCount: 3,
    priorRuns: 2,
    errorText: "Mapping failure: required segment 'BEG' is missing in the inbound 850.",
  },
  {
    jmsMessageId: MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
    queueName: MOCK_TPM_RECEIVER_DLQ,
    mplId: MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
    correlationId: `corr-${MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID}`,
    interchangeId: "7c1e2a9d0b3f4e5a8c6d1f2e3a4b5c6d",
    senderPartner: MOCK_OWN_COMPANY,
    receiverPartner: "WALMART_US",
    documentStandard: "ASC-X12",
    messageType: "856",
    controlNumber: "000020455",
    integrationFlow: RECEIVER_FLOW,
    minutesAgo: 80,
    jmsRetryCount: 5,
    priorRuns: 1,
    errorText: "AS2 receiver endpoint returned HTTP 503 Service Unavailable.",
  },
  {
    jmsMessageId: "tpm-dlq-p-01",
    queueName: MOCK_TPM_PROCESSING_DLQ,
    mplId: "tpm-dlq-p-01",
    correlationId: "corr-tpm-dlq-p-01",
    interchangeId: "1a2b3c4d5e6f708192a3b4c5d6e7f801",
    senderPartner: "TARGET_CORP",
    receiverPartner: MOCK_OWN_COMPANY,
    documentStandard: "ASC-X12",
    messageType: "810",
    controlNumber: "000031007",
    integrationFlow: PROCESSING_FLOW,
    minutesAgo: 140,
    jmsRetryCount: 1,
    priorRuns: 0,
    errorText: "Value mapping not found for 'UOM=CS' in agreement TARGET_CORP_810.",
  },
  {
    jmsMessageId: "tpm-dlq-p-02",
    queueName: MOCK_TPM_PROCESSING_DLQ,
    mplId: "tpm-dlq-p-02",
    correlationId: "corr-tpm-dlq-p-02",
    interchangeId: "2b3c4d5e6f708192a3b4c5d6e7f80912",
    senderPartner: "BOSCH_DE",
    receiverPartner: MOCK_OWN_COMPANY,
    documentStandard: "UN-EDIFACT",
    messageType: "ORDERS",
    controlNumber: "4711",
    integrationFlow: PROCESSING_FLOW,
    minutesAgo: 260,
    jmsRetryCount: 2,
    priorRuns: 3,
    errorText: "Partner agreement not found for sender BOSCH_DE and message type ORDERS D.96A.",
  },
  {
    jmsMessageId: "tpm-dlq-p-03",
    queueName: MOCK_TPM_PROCESSING_DLQ,
    mplId: "tpm-dlq-p-03",
    correlationId: "corr-tpm-dlq-p-03",
    interchangeId: "3c4d5e6f708192a3b4c5d6e7f8091a23",
    senderPartner: "COSTCO",
    receiverPartner: MOCK_OWN_COMPANY,
    documentStandard: "ASC-X12",
    messageType: "850",
    controlNumber: "000040021",
    integrationFlow: PROCESSING_FLOW,
    minutesAgo: 420,
    jmsRetryCount: 0,
    priorRuns: 0,
    errorText: "XML validation failed against the target IDoc schema ORDERS05.",
  },
  {
    jmsMessageId: "tpm-dlq-r-01",
    queueName: MOCK_TPM_RECEIVER_DLQ,
    mplId: "tpm-dlq-r-01",
    correlationId: "corr-tpm-dlq-r-01",
    interchangeId: "4d5e6f708192a3b4c5d6e7f8091a2b34",
    senderPartner: MOCK_OWN_COMPANY,
    receiverPartner: "KROGER",
    documentStandard: "ASC-X12",
    messageType: "855",
    controlNumber: "000050118",
    integrationFlow: RECEIVER_FLOW,
    minutesAgo: 190,
    jmsRetryCount: 4,
    priorRuns: 2,
    errorText: "SFTP connection to sftp.kroger-edi.example refused (auth failed).",
  },
  {
    jmsMessageId: "tpm-dlq-r-02",
    queueName: MOCK_TPM_RECEIVER_DLQ,
    mplId: "tpm-dlq-r-02",
    correlationId: "corr-tpm-dlq-r-02",
    interchangeId: "5e6f708192a3b4c5d6e7f8091a2b3c45",
    senderPartner: MOCK_OWN_COMPANY,
    receiverPartner: "METRO_AG",
    documentStandard: "UN-EDIFACT",
    messageType: "DESADV",
    controlNumber: "8822",
    integrationFlow: RECEIVER_FLOW,
    minutesAgo: 610,
    jmsRetryCount: 1,
    priorRuns: 0,
    errorText: "AS2 MDN not received within 30 minutes from METRO_AG.",
  },
  {
    jmsMessageId: "tpm-dlq-r-03",
    queueName: MOCK_TPM_RECEIVER_DLQ,
    mplId: "tpm-dlq-r-03",
    correlationId: "corr-tpm-dlq-r-03",
    interchangeId: "6f708192a3b4c5d6e7f8091a2b3c4d56",
    senderPartner: MOCK_OWN_COMPANY,
    receiverPartner: "HOME_DEPOT",
    documentStandard: "ASC-X12",
    messageType: "810",
    controlNumber: "000060902",
    integrationFlow: RECEIVER_FLOW,
    minutesAgo: 980,
    jmsRetryCount: 6,
    priorRuns: 4,
    errorText: "HTTP 401 Unauthorized from HOME_DEPOT invoice endpoint.",
  },
];

const SCENARIOS_BY_MESSAGE_ID = new Map(TPM_DLQ_SCENARIOS.map((s) => [s.jmsMessageId, s]));

/** @returns the scenario for a JMS message id, if it is one of the TPM DLQ fixtures. */
export function findTpmDlqScenario(jmsMessageId: string): TpmDlqScenario | undefined {
  return SCENARIOS_BY_MESSAGE_ID.get(jmsMessageId);
}

/** The latest run's start time for a scenario. */
export function scenarioFailedAt(scenario: TpmDlqScenario, now = Date.now()): Date {
  return new Date(now - scenario.minutesAgo * 60_000);
}

/** MPL id of the `run`-th earlier attempt (1 = the oldest). */
export function priorRunMplId(scenario: TpmDlqScenario, run: number): string {
  return `${scenario.mplId}-run-${run}`;
}

/**
 * Every processing run recorded for a scenario's correlation id, newest first: the latest failure
 * plus `priorRuns` earlier failed attempts, spaced 20 minutes apart.
 */
export function generateTpmScenarioRuns(now = Date.now()): MessageProcessingLog[] {
  const runs: MessageProcessingLog[] = [];
  for (const scenario of TPM_DLQ_SCENARIOS) {
    const latest = scenarioFailedAt(scenario, now).getTime();
    for (let attempt = scenario.priorRuns; attempt >= 0; attempt -= 1) {
      const start = latest - attempt * 20 * 60_000;
      runs.push({
        messageId:
          attempt === 0
            ? scenario.mplId
            : priorRunMplId(scenario, scenario.priorRuns - attempt + 1),
        correlationId: scenario.correlationId,
        integrationFlow: scenario.integrationFlow,
        status: "FAILED",
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + 4_200).toISOString(),
        processingTimeMs: 4_200,
        sender: scenario.senderPartner,
        receiver: scenario.receiverPartner,
        customStatus: undefined,
        applicationId: scenario.controlNumber,
        messageType: scenario.messageType,
        senderInterchangeControl: scenario.controlNumber,
        receiverInterchangeControl: undefined,
        businessRole: "both",
      });
    }
  }
  return runs.sort((a, b) => b.startTime.localeCompare(a.startTime));
}
