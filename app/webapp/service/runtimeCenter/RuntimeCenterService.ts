import BaseService from "../../core/base/BaseService";
import type {
  CatalogEntry,
  DeploymentEvent,
  IntegrationDetails,
  RuntimeHealthSummary,
} from "./RuntimeCenterTypes";

/**
 * Data service for the Runtime Center. Consumes **only** `/api/v1/runtime-center`, which the backend
 * composes entirely from the Operations Engine — the workspace never talks to the SDK, never knows a
 * runtime artifact entity-set name, and only ever handles Runtime Center DTOs (architecture: UI →
 * Operations Engine → SDK → Integration Suite).
 */
export default class RuntimeCenterService extends BaseService {
  public constructor() {
    super("/api/v1/runtime-center");
  }

  /** Lists every deployed integration flow, enriched with recent message stats. */
  public async listCatalog(signal?: AbortSignal): Promise<readonly CatalogEntry[]> {
    return this.client.get<readonly CatalogEntry[]>(this.path("catalog"), { signal });
  }

  /** Loads the full Integration Details view for one deployed artifact. */
  public async getDetails(artifactId: string, signal?: AbortSignal): Promise<IntegrationDetails> {
    return this.client.get<IntegrationDetails>(
      this.path(`${encodeURIComponent(artifactId)}/details`),
      { signal },
    );
  }

  /** Loads Runtime Health for one deployed artifact. */
  public async getHealth(artifactId: string, signal?: AbortSignal): Promise<RuntimeHealthSummary> {
    return this.client.get<RuntimeHealthSummary>(
      this.path(`${encodeURIComponent(artifactId)}/health`),
      { signal },
    );
  }

  /** Loads the Deployment Timeline for one deployed artifact. */
  public async getDeploymentTimeline(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<readonly DeploymentEvent[]> {
    return this.client.get<readonly DeploymentEvent[]>(
      this.path(`${encodeURIComponent(artifactId)}/timeline`),
      { signal },
    );
  }

  /** Redeploys (restarts) an artifact and returns the recorded Deployment Timeline event. */
  public async redeploy(artifactId: string): Promise<DeploymentEvent> {
    return this.client.post<DeploymentEvent>(
      this.path(`${encodeURIComponent(artifactId)}/redeploy`),
    );
  }
}
