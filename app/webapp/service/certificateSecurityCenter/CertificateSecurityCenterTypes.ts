/**
 * Client-side mirror of the Certificate & Security Center DTOs served by
 * `/api/v1/certificate-security-center`, itself composed entirely from the Operations Engine's
 * `CertificateSecurityEngine` (architecture: Phase 13). No SDK/CPI/OData shape ever reaches this
 * module — every field here matches `srv/src/operations/dto/CertificateSecurityDto.ts`, including
 * its extension-point/heuristic documentation.
 */

/** The shared health vocabulary (`healthy`/`warning`/`critical`) every Operations DTO speaks. */
export type HealthStatus = "healthy" | "warning" | "critical";

/** One deployed keystore entry, enriched with Certificate Explorer's extension points and heuristics. */
export interface CertificateDetail {
  readonly alias: string;
  readonly keyType: string;
  readonly owner: string | undefined;
  readonly issuer: string | undefined;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string | undefined;
  readonly daysRemaining: number;
  readonly health: HealthStatus;
  /** Reserved extension point — no data source exists in this SDK today. */
  readonly subject: string | undefined;
  /** Reserved extension point — no data source exists in this SDK today. */
  readonly fingerprint: string | undefined;
  /** Reserved extension point — no data source exists in this SDK today. */
  readonly signatureAlgorithm: string | undefined;
  /** Heuristic (`owner === issuer`); `undefined` when either is missing. Not a cryptographic certainty. */
  readonly selfSigned: boolean | undefined;
  /** Heuristic: a known-weak marker appears in `keyType`. May under-detect; never a fabricated positive. */
  readonly weakAlgorithm: boolean;
  /** Reserved extension point — no certificate-to-flow usage mapping exists in this domain model. */
  readonly usedByIntegrationFlows: readonly string[];
  /** Reserved extension point — no certificate-to-destination usage mapping exists in this domain model. */
  readonly usedByDestinations: readonly string[];
  /** 0–100 composite risk score — a documented heuristic, not a measured value. */
  readonly riskScore: number;
}

/** One category of Security Material. */
export type SecurityMaterialCategory =
  | "keystore"
  | "oauthCredential"
  | "trustStore"
  | "sshKey"
  | "pgpKey";

/** The availability of one Security Material category — only `keystore` is backed by real data today. */
export interface SecurityMaterialAvailability {
  readonly category: SecurityMaterialCategory;
  readonly available: boolean;
  readonly count: number | undefined;
  readonly reason: string | undefined;
}

/** Aggregate security posture across every known certificate. */
export interface SecuritySummary {
  readonly totalCertificates: number;
  readonly healthyCount: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly expiringSoonCount: number;
  readonly expiredCount: number;
  readonly selfSignedCount: number;
  readonly weakAlgorithmCount: number;
  readonly healthScore: number;
}

/** A minimal certificate summary, as surfaced by the Operations Engine's CertificateEngine. */
export interface CertificateSummary {
  readonly alias: string;
  readonly keyType: string;
  readonly owner: string | undefined;
  readonly issuer: string | undefined;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string | undefined;
  readonly daysRemaining: number;
  readonly health: HealthStatus;
}

/** The composed view the Certificate Dashboard renders in one call. */
export interface CertificateDashboard {
  readonly summary: SecuritySummary;
  readonly expiringSoon: readonly CertificateSummary[];
  readonly expired: readonly CertificateSummary[];
  readonly securityMaterials: readonly SecurityMaterialAvailability[];
}

/** The kind of one Certificate Timeline event. */
export type CertificateTimelineEventKind =
  | "imported"
  | "expiring"
  | "expired"
  | "flaggedForRenewal";

/** One entry in a certificate's Timeline — session-only, future persistence ready. */
export interface CertificateTimelineEvent {
  readonly eventId: string;
  readonly alias: string;
  readonly kind: CertificateTimelineEventKind;
  readonly timestamp: string;
  readonly actor: string | undefined;
  readonly note: string;
}
