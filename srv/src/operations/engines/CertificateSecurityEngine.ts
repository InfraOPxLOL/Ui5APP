import type { CertificateEngine } from "./CertificateEngine.js";
import type { CertificateSummary } from "../dto/CertificateDto.js";
import type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
  SecuritySummary,
} from "../dto/CertificateSecurityDto.js";
import { OperationsCache } from "../cache/index.js";
import {
  certificateSecurityStateStore,
  CertificateSecurityStateStore,
} from "./CertificateSecurityStateStore.js";

/** Certificates due within this many days count as "expiring soon" on the dashboard. */
const EXPIRING_SOON_DAYS = 30;
/**
 * Substrings of `keyType` (upper-cased) that mark a known-weak algorithm/key size. Deliberately
 * narrow and literal — this domain has no dedicated signature-algorithm or key-size field, so this
 * can only ever flag what actually appears in the real `keyType` string, never invent a positive.
 */
const WEAK_ALGORITHM_MARKERS = ["MD5", "SHA1", "DES", "512", "1024"];

function newTimelineEventId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Prepares Certificate & Security Center information (architecture: Phase 13, Certificate Security
 * Engine). Composes the existing `CertificateEngine` (Phase 6) into this phase's own DTOs — it never
 * touches `core/providers`/`sdk/providers` directly, and never modifies `CertificateEngine` itself.
 *
 * See `operations/dto/CertificateSecurityDto.ts`'s own doc comment for the full accounting of what
 * is real data, what is a documented heuristic, and what is a reserved (never fabricated) extension
 * point.
 */
export class CertificateSecurityEngine {
  public constructor(
    private readonly certificate: CertificateEngine,
    private readonly cache: OperationsCache,
    private readonly stateStore: CertificateSecurityStateStore = certificateSecurityStateStore,
  ) {}

  /** Lists every keystore entry for the Certificate Explorer, enriched with heuristics and extension points. */
  public async listCertificates(): Promise<readonly CertificateDetail[]> {
    return this.cache.dedupe("certificateSecurity.list", async () => {
      const certificates = await this.certificate.listCertificates();
      return certificates.map(CertificateSecurityEngine.toDetail);
    });
  }

  /**
   * Reads one certificate by alias.
   * @param alias the keystore entry alias.
   * @returns the enriched certificate, or `undefined` when unknown.
   */
  public async getCertificate(alias: string): Promise<CertificateDetail | undefined> {
    const certificates = await this.listCertificates();
    return certificates.find((certificate) => certificate.alias === alias);
  }

  /** Composes the single aggregated view the Certificate Dashboard renders. */
  public async getDashboard(): Promise<CertificateDashboard> {
    const certificates = await this.listCertificates();
    const expiringSoon = certificates.filter(
      (certificate) =>
        certificate.daysRemaining >= 0 && certificate.daysRemaining <= EXPIRING_SOON_DAYS,
    );
    const expired = certificates.filter((certificate) => certificate.daysRemaining < 0);
    const summary: SecuritySummary = {
      totalCertificates: certificates.length,
      healthyCount: certificates.filter((c) => c.health === "healthy").length,
      warningCount: certificates.filter((c) => c.health === "warning").length,
      criticalCount: certificates.filter((c) => c.health === "critical").length,
      expiringSoonCount: expiringSoon.length,
      expiredCount: expired.length,
      selfSignedCount: certificates.filter((c) => c.selfSigned === true).length,
      weakAlgorithmCount: certificates.filter((c) => c.weakAlgorithm).length,
      healthScore: CertificateSecurityEngine.computeAggregateHealthScore(certificates),
    };
    return {
      summary,
      expiringSoon,
      expired,
      securityMaterials: CertificateSecurityEngine.securityMaterialsAvailability(
        certificates.length,
      ),
    };
  }

  /** Lists the availability of every Security Material category (§ Security Materials). */
  public async listSecurityMaterials(): Promise<readonly SecurityMaterialAvailability[]> {
    const certificates = await this.listCertificates();
    return CertificateSecurityEngine.securityMaterialsAvailability(certificates.length);
  }

  /** Lists a certificate's Timeline, seeding it from the certificate's real dates if empty. */
  public async getTimeline(
    alias: string,
  ): Promise<readonly CertificateTimelineEvent[] | undefined> {
    const certificate = await this.getCertificate(alias);
    if (certificate === undefined) {
      return undefined;
    }
    return this.ensureTimelineSeeded(certificate);
  }

  /**
   * Flags a certificate for renewal — the one genuinely mutating action this phase supports, since
   * `ICertificateProvider` is read-only by design (no real "renew"/"replace" CPI action exists to
   * wire up). Records a `"flaggedForRenewal"` Timeline event.
   * @param alias the keystore entry alias.
   * @param actor the operator flagging the certificate, for the timeline entry.
   * @returns the recorded event, or `undefined` when the alias is unknown.
   */
  public async flagForRenewal(
    alias: string,
    actor: string,
  ): Promise<CertificateTimelineEvent | undefined> {
    const certificate = await this.getCertificate(alias);
    if (certificate === undefined) {
      return undefined;
    }
    this.ensureTimelineSeeded(certificate);
    const event: CertificateTimelineEvent = {
      eventId: newTimelineEventId("cert-flag"),
      alias,
      kind: "flaggedForRenewal",
      timestamp: new Date().toISOString(),
      actor,
      note: `Flagged for renewal by ${actor}.`,
    };
    this.stateStore.recordTimelineEvent(event);
    return event;
  }

  // -----------------------------------------------------------------------------------------------

  private ensureTimelineSeeded(
    certificate: CertificateDetail,
  ): readonly CertificateTimelineEvent[] {
    const existing = this.stateStore.listTimeline(certificate.alias);
    if (existing.length > 0) {
      return existing;
    }
    this.stateStore.recordTimelineEvent({
      eventId: `cert-seed-imported-${certificate.alias}`,
      alias: certificate.alias,
      kind: "imported",
      timestamp: certificate.validFrom,
      actor: undefined,
      note: "Certificate became valid (validFrom).",
    });
    this.stateStore.recordTimelineEvent({
      eventId: `cert-seed-expiry-${certificate.alias}`,
      alias: certificate.alias,
      kind: certificate.daysRemaining < 0 ? "expired" : "expiring",
      timestamp: certificate.validTo,
      actor: undefined,
      note:
        certificate.daysRemaining < 0
          ? "Certificate has expired (validTo)."
          : "Certificate's scheduled expiry (validTo).",
    });
    return this.stateStore.listTimeline(certificate.alias);
  }

  private static securityMaterialsAvailability(
    keystoreCount: number,
  ): readonly SecurityMaterialAvailability[] {
    return [
      { category: "keystore", available: true, count: keystoreCount, reason: undefined },
      {
        category: "oauthCredential",
        available: false,
        count: undefined,
        reason:
          "No OAuth credential provider exists in this SDK yet (reserved extension point: a future IOAuthCredentialProvider contract, mirroring ICertificateProvider's shape).",
      },
      {
        category: "trustStore",
        available: false,
        count: undefined,
        reason:
          "CPI's KeystoreEntries entity set, as modeled by this SDK, does not distinguish trust store entries from keystore entries.",
      },
      {
        category: "sshKey",
        available: false,
        count: undefined,
        reason:
          "No SSH key provider exists in this SDK yet (reserved extension point: a future ISshKeyProvider contract).",
      },
      {
        category: "pgpKey",
        available: false,
        count: undefined,
        reason:
          "No PGP key provider exists in this SDK yet (reserved extension point: a future IPgpKeyProvider contract).",
      },
    ];
  }

  private static toDetail(summary: CertificateSummary): CertificateDetail {
    const selfSigned =
      summary.owner === undefined || summary.issuer === undefined
        ? undefined
        : summary.owner === summary.issuer;
    const weakAlgorithm = CertificateSecurityEngine.isWeakAlgorithm(summary.keyType);
    const riskScore = CertificateSecurityEngine.computeRiskScore(
      summary.daysRemaining,
      selfSigned,
      weakAlgorithm,
    );
    return {
      ...summary,
      subject: undefined,
      fingerprint: undefined,
      signatureAlgorithm: undefined,
      selfSigned,
      weakAlgorithm,
      usedByIntegrationFlows: [],
      usedByDestinations: [],
      riskScore,
    };
  }

  private static isWeakAlgorithm(keyType: string): boolean {
    const upper = keyType.toUpperCase();
    return WEAK_ALGORITHM_MARKERS.some((marker) => upper.includes(marker));
  }

  /**
   * Composite 0–100 risk score: expiry proximity is the dominant factor, with additive penalties for
   * the self-signed and weak-algorithm heuristics. A documented heuristic, not a measured value —
   * mirrors `RecoveryEngine`/`RuntimeCenterEngine`'s own health-score treatment.
   */
  private static computeRiskScore(
    daysRemaining: number,
    selfSigned: boolean | undefined,
    weakAlgorithm: boolean,
  ): number {
    let risk = 0;
    if (daysRemaining < 0) {
      risk += 60;
    } else if (daysRemaining <= 7) {
      risk += 45;
    } else if (daysRemaining <= 30) {
      risk += 25;
    } else if (daysRemaining <= 90) {
      risk += 10;
    }
    if (selfSigned === true) {
      risk += 20;
    }
    if (weakAlgorithm) {
      risk += 20;
    }
    return Math.max(0, Math.min(100, risk));
  }

  private static computeAggregateHealthScore(certificates: readonly CertificateDetail[]): number {
    if (certificates.length === 0) {
      return 100;
    }
    const total = certificates.reduce((sum, certificate) => sum + (100 - certificate.riskScore), 0);
    return Math.round(total / certificates.length);
  }
}
