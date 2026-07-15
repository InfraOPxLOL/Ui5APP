import BaseService from "../../core/base/BaseService";
import type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
} from "./CertificateSecurityCenterTypes";

/**
 * Data service for the Certificate & Security Center. Consumes **only**
 * `/api/v1/certificate-security-center`, which the backend composes entirely from the Operations
 * Engine — the workspace never talks to the SDK, never knows a `KeystoreEntries` entity-set name, and
 * only ever handles Certificate Security DTOs (architecture: UI → Operations Engine → SDK →
 * Integration Suite).
 */
export default class CertificateSecurityCenterService extends BaseService {
  public constructor() {
    super("/api/v1/certificate-security-center");
  }

  /** Loads the composed Certificate Dashboard. */
  public async getDashboard(signal?: AbortSignal): Promise<CertificateDashboard> {
    return this.client.get<CertificateDashboard>(this.path("dashboard"), { signal });
  }

  /** Lists every keystore entry for the Certificate Explorer. */
  public async listCertificates(signal?: AbortSignal): Promise<readonly CertificateDetail[]> {
    return this.client.get<readonly CertificateDetail[]>(this.path("certificates"), { signal });
  }

  /** Loads one certificate's detail. */
  public async getCertificate(alias: string, signal?: AbortSignal): Promise<CertificateDetail> {
    return this.client.get<CertificateDetail>(
      this.path(`certificates/${encodeURIComponent(alias)}`),
      { signal },
    );
  }

  /** Loads the availability of every Security Material category. */
  public async listSecurityMaterials(
    signal?: AbortSignal,
  ): Promise<readonly SecurityMaterialAvailability[]> {
    return this.client.get<readonly SecurityMaterialAvailability[]>(
      this.path("security-materials"),
      { signal },
    );
  }

  /** Loads a certificate's Timeline. */
  public async getTimeline(
    alias: string,
    signal?: AbortSignal,
  ): Promise<readonly CertificateTimelineEvent[]> {
    return this.client.get<readonly CertificateTimelineEvent[]>(
      this.path(`certificates/${encodeURIComponent(alias)}/timeline`),
      { signal },
    );
  }

  /** Flags a certificate for renewal and returns the recorded Timeline event. */
  public async flagForRenewal(alias: string): Promise<CertificateTimelineEvent> {
    return this.client.post<CertificateTimelineEvent>(
      this.path(`certificates/${encodeURIComponent(alias)}/flag-for-renewal`),
    );
  }
}
