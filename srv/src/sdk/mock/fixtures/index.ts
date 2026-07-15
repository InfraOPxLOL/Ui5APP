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
} from "./MessageFixtures.js";
export { generateRuntimeArtifacts } from "./RuntimeArtifactFixtures.js";
export {
  generateQueueStates,
  generateQueuedMessages,
  generateSingleMessage,
  MOCK_DISCOVERED_QUEUE_NAMES,
} from "./QueueFixtures.js";
export { generateCertificates } from "./CertificateFixtures.js";
export { generateAlerts } from "./AlertFixtures.js";
export { generateValueMappingSchemes } from "./ValueMappingFixtures.js";
export { generatePayloadAttachments } from "./PayloadFixtures.js";
export { generateApis } from "./ApiFixtures.js";
export { generateApplications } from "./ApplicationFixtures.js";
export { generateSplunkHecEvent, type SplunkHecEvent } from "./SplunkFixtures.js";
