import type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
} from "../../operations/dto/index.js";

/**
 * Data transfer objects for the Certificate & Security Center (Phase 13) — the HTTP contract behind
 * `/api/v1/certificate-security-center`. Every response shape is the Operations Engine's own
 * Certificate Security DTO, re-exported verbatim (no SDK/CPI/OData shape ever appears here).
 */
export type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
};
