import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type {
  CatalogEntry,
  DeploymentEvent,
  IntegrationDetails,
  RuntimeHealthSummary,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/**
 * Aggregation service for the Runtime Center (Phase 12). Builds a fresh, request-scoped
 * {@link OperationsEngine} per call (matching every other Operations-Engine-consuming module) and
 * delegates entirely to `engine.runtimeCenter` — this service adds no business logic of its own,
 * only the HTTP-facing seam (deriving `actor` from the caller's identity for redeploys).
 *
 * Deployment Timeline and failure-trend samples live in `RuntimeCenterStateStore`'s process-lifetime
 * singleton (see its own doc comment), so they survive across the many short-lived engines this
 * service constructs.
 */
export class RuntimeCenterService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  public async listCatalog(): Promise<readonly CatalogEntry[]> {
    return this.engineFactory().runtimeCenter.listCatalog();
  }

  public async getDetails(artifactId: string): Promise<IntegrationDetails | undefined> {
    return this.engineFactory().runtimeCenter.getDetails(artifactId);
  }

  public async getHealth(artifactId: string): Promise<RuntimeHealthSummary | undefined> {
    return this.engineFactory().runtimeCenter.getHealth(artifactId);
  }

  public async getDeploymentTimeline(
    artifactId: string,
  ): Promise<readonly DeploymentEvent[] | undefined> {
    return this.engineFactory().runtimeCenter.getDeploymentTimeline(artifactId);
  }

  public async redeploy(artifactId: string, actor: string): Promise<DeploymentEvent | undefined> {
    return this.engineFactory().runtimeCenter.redeploy(artifactId, actor);
  }
}

/** Shared service instance. */
export const runtimeCenterService = new RuntimeCenterService();
