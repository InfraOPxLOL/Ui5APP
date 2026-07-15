import type { CertificateClient } from "../../sdk/client/CertificateClient.js";
import type { CertificateInfo } from "../../core/providers/types.js";
import type { CertificateSummary } from "../dto/CertificateDto.js";
import { OperationsCache } from "../cache/index.js";
import { certificateHealth, daysRemaining } from "../transform/index.js";
import { FilterEngine } from "./FilterEngine.js";

/**
 * Prepares certificate/keystore information (architecture: Phase 6, Certificate Engine, §10). The
 * only place any future module reads certificate state from — always through
 * {@link CertificateSummary}, never through `sdk.certificate`'s `CertificateInfo` directly.
 */
export class CertificateEngine {
  public constructor(
    private readonly client: CertificateClient,
    private readonly cache: OperationsCache,
  ) {}

  /** Lists every keystore entry, enriched with `daysRemaining`/`health`. */
  public async listCertificates(): Promise<readonly CertificateSummary[]> {
    return this.cache.dedupe("certificate.list", async () => {
      const certificates = await this.client.listCertificates();
      return certificates.map(CertificateEngine.toSummary);
    });
  }

  /**
   * Lists certificates expiring within a horizon, soonest first.
   * @param withinDays the look-ahead horizon in days.
   * @returns the expiring certificates.
   */
  public async listExpiring(withinDays: number): Promise<readonly CertificateSummary[]> {
    return this.cache.dedupe(`certificate.expiring:${withinDays}`, async () => {
      const certificates = await this.client.listExpiring(withinDays);
      return certificates.map(CertificateEngine.toSummary);
    });
  }

  /**
   * Searches certificates by alias substring and/or expiry horizon.
   * @param criteria `certificate` (alias substring) and/or `certificateExpiryWithinDays`.
   * @returns the matching certificates.
   */
  public async search(criteria: {
    readonly alias?: string;
    readonly expiryWithinDays?: number;
  }): Promise<readonly CertificateSummary[]> {
    const all = await this.listCertificates();
    return FilterEngine.forCertificates().apply(all, {
      certificate: criteria.alias,
      certificateExpiryWithinDays: criteria.expiryWithinDays,
    });
  }

  private static toSummary(certificate: CertificateInfo): CertificateSummary {
    return {
      alias: certificate.alias,
      keyType: certificate.keyType,
      owner: certificate.owner,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      serialNumber: certificate.serialNumber,
      daysRemaining: daysRemaining(certificate.validTo),
      health: certificateHealth(certificate.validTo),
    };
  }
}
