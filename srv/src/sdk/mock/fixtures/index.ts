/** Barrel for the mock engine's realistic data fixture generators, one module per domain. */
export {
  generateMessageLogs,
  generateErrorDetails,
  generateCustomHeaders,
  JMS_INGRESS_IFLOW_NAME,
  JMS_EGRESS_IFLOW_NAME,
  MOCK_JMS_INGRESS_MESSAGE_ID,
  MOCK_JMS_EGRESS_MESSAGE_ID,
  MOCK_JMS_SOURCE_MESSAGE_ID,
  MOCK_JMS_RESOLVED_QUEUE,
  MOCK_TPM_PROCESSING_DLQ_MESSAGE_ID,
  MOCK_TPM_RECEIVER_DLQ_MESSAGE_ID,
  MOCK_TPM_INBOUND_MESSAGE_ID,
  MOCK_TPM_ORPHAN_MESSAGE_ID,
  MOCK_ROUTER_DLQ_MESSAGE_ID,
  MOCK_STATUS_SYNC_DLQ_MESSAGE_ID,
  MOCK_TPM_INBOUND_QUEUE,
  MOCK_TPM_OUTBOUND_QUEUE,
  MOCK_TPM_PROCESSING_DLQ,
  MOCK_TPM_RECEIVER_DLQ,
  MOCK_ROUTER_QUEUE,
  MOCK_ROUTER_DLQ,
  MOCK_STATUS_SYNC_QUEUE,
  MOCK_STATUS_SYNC_DLQ,
  MOCK_FRAMEWORK_MESSAGE_QUEUES,
  MOCK_FRAMEWORK_ABSENT_MESSAGE_IDS,
} from "./MessageFixtures.js";
export { generateRuntimeArtifacts } from "./RuntimeArtifactFixtures.js";
export {
  generateQueueStates,
  generateQueuedMessages,
  generateSingleMessage,
  recordMockMove,
  resetMockMoves,
  MOCK_DISCOVERED_QUEUE_NAMES,
  MOCK_CENTRAL_DLQ_QUEUE,
} from "./QueueFixtures.js";
export { generateCertificates } from "./CertificateFixtures.js";
export { generateAlerts } from "./AlertFixtures.js";
export { generateValueMappingSchemes } from "./ValueMappingFixtures.js";
export { generatePayloadAttachments } from "./PayloadFixtures.js";
export { generateApis } from "./ApiFixtures.js";
export { generateApplications } from "./ApplicationFixtures.js";
export { generateSplunkHecEvent, type SplunkHecEvent } from "./SplunkFixtures.js";
