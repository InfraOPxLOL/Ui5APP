/**
 * Barrel for the SDK's DTO layer (architecture: DTO Layer, §12). The platform's neutral Integration
 * Suite domain shapes were already established in Phase 3 (`core/providers/types.js`) as the
 * contract every provider interface speaks — re-exported here under their original names so the
 * SDK exposes one complete, documented DTO surface without renaming or duplicating them:
 *
 * - **Message** → {@link MessageProcessingLog}
 * - **RuntimeArtifact** → {@link RuntimeArtifactStatus}
 * - **Queue** → {@link QueueRuntimeInfo} (plus {@link QueuedMessage} for queue contents)
 * - **Payload** → {@link PayloadEnvelope}
 * - **Certificate** → {@link CertificateInfo}
 * - **Alert** → {@link AlertEvent}
 * - **ValueMapping** → {@link ValueMappingScheme} (its `IValueMappingProvider` contract was added
 *   in Phase 4, alongside this SDK, but the domain type itself lives with its siblings in
 *   `core/providers/types.js` for consistency)
 *
 * New DTOs introduced by the SDK (concepts Phase 3 did not yet cover):
 * - **Api** → {@link ApiDto}
 * - **Application** → {@link ApplicationDto}
 * - **RetryRequest** / **RetryResponse** → {@link RetryRequestDto} / {@link RetryResponseDto}
 */
export type {
  MessageProcessingLog,
  MessageLogFilter,
  MessageErrorDetail,
  RuntimeArtifactStatus,
  QueueRuntimeInfo,
  QueuedMessage,
  PayloadEnvelope,
  CertificateInfo,
  AlertEvent,
  ValueMappingEntry,
  ValueMappingAgency,
  ValueMappingScheme,
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
} from "../../core/providers/types.js";

export type { ApiDto, ApiStatus } from "./ApiDto.js";
export type { ApplicationDto, ApplicationStatus } from "./ApplicationDto.js";
export type { RetryRequestDto, RetryResponseDto } from "./RetryDto.js";
