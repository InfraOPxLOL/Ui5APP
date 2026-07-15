import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/**
 * Aggregation service for the Certificate & Security Center (Phase 13). Builds a fresh,
 * request-scoped {@link OperationsEngine} per call (matching every other Operations-Engine-consuming
 * module) and delegates entirely to `engine.certificateSecurity` — this service adds no business
 * logic of its own, only the HTTP-facing seam (deriving `actor` from the caller's identity for the
 * flag-for-renewal action).
 *
 * The Timeline lives in `CertificateSecurityStateStore`'s process-lifetime singleton (see its own
 * doc comment), so it survives across the many short-lived engines this service constructs.
 */
export class CertificateSecurityCenterService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  public async getDashboard(): Promise<CertificateDashboard> {
    return this.engineFactory().certificateSecurity.getDashboard();
  }

  public async listCertificates(): Promise<readonly CertificateDetail[]> {
    return this.engineFactory().certificateSecurity.listCertificates();
  }

  public async getCertificate(alias: string): Promise<CertificateDetail | undefined> {
    return this.engineFactory().certificateSecurity.getCertificate(alias);
  }

  public async listSecurityMaterials(): Promise<readonly SecurityMaterialAvailability[]> {
    return this.engineFactory().certificateSecurity.listSecurityMaterials();
  }

  public async getTimeline(
    alias: string,
  ): Promise<readonly CertificateTimelineEvent[] | undefined> {
    return this.engineFactory().certificateSecurity.getTimeline(alias);
  }

  public async flagForRenewal(
    alias: string,
    actor: string,
  ): Promise<CertificateTimelineEvent | undefined> {
    return this.engineFactory().certificateSecurity.flagForRenewal(alias, actor);
  }
}

/** Shared service instance. */
export const certificateSecurityCenterService = new CertificateSecurityCenterService();
