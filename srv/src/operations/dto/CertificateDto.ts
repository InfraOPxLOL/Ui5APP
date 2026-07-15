import type { HealthStatus } from "../transform/index.js";

/**
 * The business-friendly view of one keystore entry (architecture: Phase 6, Certificate Engine, §10).
 * Enriches `sdk.certificate`'s `CertificateInfo` with `daysRemaining`/`health` so a caller never
 * recomputes expiry math itself.
 *
 * `subject`/`fingerprint` are documented future fields: `core/providers`'s frozen `CertificateInfo`
 * domain type does not carry them yet (SAP's Security Content API exposes both as distinct
 * properties from the summary listing this engine is built on) — a purely additive extension to
 * that type, and to this DTO, when a future phase needs them. `owner` is today's closest available
 * field and is intentionally *not* presented as `subject` — the two are related but not
 * interchangeable (an X.509 subject DN is a structured, multi-attribute value; `owner` is CPI's own,
 * simpler summary field).
 */
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
