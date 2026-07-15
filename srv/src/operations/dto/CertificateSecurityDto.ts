import type { HealthStatus } from "../transform/index.js";
import type { CertificateSummary } from "./CertificateDto.js";

/**
 * Business-friendly DTOs for the Certificate & Security Center (architecture: Phase 13, Certificate
 * Security Engine). Built entirely from `CertificateEngine`'s existing {@link CertificateSummary} —
 * no SDK/CPI/OData shape ever crosses this boundary.
 *
 * Per this phase's explicit instruction, nothing here is fabricated: SAP Integration Suite's
 * `KeystoreEntries` OData entity set (this SDK's only certificate data source — see
 * `RealCertificateProvider`) carries no subject DN, fingerprint, signature algorithm, certificate
 * chain, or certificate-to-artifact usage data. Fields that would need that data are honestly
 * reserved (`undefined`/empty) rather than invented, each documented on the field itself. Two fields
 * — {@link CertificateDetail.selfSigned} and {@link CertificateDetail.weakAlgorithm} — are documented
 * *heuristics* computed from the real fields this domain does carry (`owner`/`issuer`/`keyType`),
 * not certainties; they are clearly named and documented as approximations.
 */

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
  /**
   * Reserved extension point: SAP Integration Suite's Security Content API document set has no
   * subject-DN property on `KeystoreEntries` that this SDK reads today. `undefined` until a future
   * phase adds a provider capable of supplying it — never derived from `owner` (a subject DN is a
   * structured, multi-attribute value; `owner` is CPI's own simpler summary field).
   */
  readonly subject: string | undefined;
  /** Reserved extension point: no certificate fingerprint (SHA-1/SHA-256 of the DER bytes) is exposed by this SDK's data source today. */
  readonly fingerprint: string | undefined;
  /** Reserved extension point: no signature algorithm is exposed by this SDK's data source today. */
  readonly signatureAlgorithm: string | undefined;
  /**
   * Heuristic: `true` when `owner` and `issuer` are both present and equal, `false` when both are
   * present and differ, `undefined` when either is missing and self-signed status cannot be
   * determined. Not a cryptographic certainty — a true self-signed check requires comparing the
   * certificate's actual subject and issuer DNs, neither of which this domain model carries.
   */
  readonly selfSigned: boolean | undefined;
  /**
   * Heuristic: `true` when `keyType` contains a recognized weak-algorithm/key-size marker (e.g.
   * `MD5`, `SHA1`, `DES`, a 512/1024-bit RSA key). Never a false positive fabricated from nothing —
   * only ever derived from the real `keyType` string this domain already carries — but may
   * under-detect: this domain has no dedicated signature-algorithm or key-size field.
   */
  readonly weakAlgorithm: boolean;
  /** Reserved extension point: no certificate-to-integration-flow usage mapping exists in this domain model. */
  readonly usedByIntegrationFlows: readonly string[];
  /** Reserved extension point: no certificate-to-destination usage mapping exists in this domain model. */
  readonly usedByDestinations: readonly string[];
  /**
   * 0–100 composite risk score derived entirely from real/heuristic fields already on this entry
   * (expiry proximity, `selfSigned`, `weakAlgorithm`) — a documented heuristic, not a measured value.
   */
  readonly riskScore: number;
}

/** One category of Security Material (§ Security Materials). */
export type SecurityMaterialCategory =
  | "keystore"
  | "oauthCredential"
  | "trustStore"
  | "sshKey"
  | "pgpKey";

/**
 * The availability of one Security Material category. Only `keystore` is backed by real data today
 * (`CertificateEngine`, itself backed by CPI's `KeystoreEntries`); the other four have no provider
 * contract anywhere in this SDK — SAP Integration Suite's Security Material Manager models them as
 * distinct entities this codebase has never had a real or mock implementation for. Each unavailable
 * category names the extension point a future phase would add (a new `I*Provider` contract, mirroring
 * `ICertificateProvider`'s own shape) rather than fabricating rows to fill the section.
 */
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
  /** 0–100 composite score across the whole certificate population — a documented heuristic. */
  readonly healthScore: number;
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

/**
 * One entry in a certificate's Timeline — session-only, future persistence ready (backed by
 * `CertificateSecurityStateStore`, a process-lifetime singleton, mirroring Recovery/Runtime Center's
 * own state stores). `"imported"`/`"expiring"`/`"expired"` are derived from the certificate's real
 * `validFrom`/`validTo` dates the moment its timeline is first requested; `"flaggedForRenewal"` is the
 * one genuinely mutating action this phase supports — `ICertificateProvider` is read-only by design
 * (its own doc comment: "mutating keystore operations are a deliberately separate future contract"),
 * so there is no real renewal/replacement action to wire up. Never a fabricated historical event.
 */
export interface CertificateTimelineEvent {
  readonly eventId: string;
  readonly alias: string;
  readonly kind: CertificateTimelineEventKind;
  readonly timestamp: string;
  /** The operator who flagged the certificate for renewal; `undefined` for auto-derived milestones. */
  readonly actor: string | undefined;
  readonly note: string;
}
