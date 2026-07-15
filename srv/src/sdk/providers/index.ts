/**
 * Barrel for the SDK's mock provider implementations — one concrete, mock-data-backed class per
 * Phase-3 provider contract (plus `IValueMappingProvider`, added in Phase 4). Real,
 * connectivity-backed implementations are a future phase; these exist so every module can be
 * developed and demoed against realistic data today (architecture: Provider Framework, §10; Mock
 * Engine, §11).
 */
export { MockMonitoringProvider } from "./MockMonitoringProvider.js";
export { MockJmsProvider } from "./MockJmsProvider.js";
export { MockPayloadProvider } from "./MockPayloadProvider.js";
export { MockCertificateProvider } from "./MockCertificateProvider.js";
export { MockRuntimeProvider } from "./MockRuntimeProvider.js";
export { MockAlertProvider } from "./MockAlertProvider.js";
export { MockValueMappingProvider } from "./MockValueMappingProvider.js";
export { MockSplunkProvider } from "./MockSplunkProvider.js";
export { decodeGzipBase64Text } from "./SplunkPayloadCodec.js";
export { MockPartnerDirectoryProvider } from "./MockPartnerDirectoryProvider.js";

/**
 * Live, Integration-Suite-backed implementations of the same Phase-3 provider contracts (Phase 5 —
 * "every provider should now have a mock implementation AND a real implementation"). Selected
 * instead of the mock providers above by the SDK composition root's `providerMode` configuration;
 * see `sdk/client/IntegrationSuiteSdkClient` and `sdk/providers/README.md`.
 */
export { RealMonitoringProvider } from "./RealMonitoringProvider.js";
export { RealRuntimeProvider } from "./RealRuntimeProvider.js";
export { RealPayloadProvider } from "./RealPayloadProvider.js";
export { RealCertificateProvider } from "./RealCertificateProvider.js";
export { RealJmsProvider, type JmsProviderEndpoints } from "./RealJmsProvider.js";
export {
  RealValueMappingProvider,
  type ValueMappingProviderEndpoints,
} from "./RealValueMappingProvider.js";
export { RealAlertProvider, type AlertNotificationServiceConfig } from "./RealAlertProvider.js";
export { RealPartnerDirectoryProvider } from "./RealPartnerDirectoryProvider.js";
export { parseODataV2DateTime, toODataV2KeyLiteral } from "./RealProviderSupport.js";
