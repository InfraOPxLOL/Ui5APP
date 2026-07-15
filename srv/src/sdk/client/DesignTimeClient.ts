import type { ApplicationDto } from "../dto/ApplicationDto.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateApplications } from "../mock/fixtures/index.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * Design-time sub-client (architecture: Integration Suite Client, §4 — `DesignTimeClient`). No
 * Phase-3 provider contract exists for design-time content browsing, so this client generates its
 * {@link ApplicationDto} data directly through the {@link MockEngine} — backs the future
 * Integration Advisor / design-time browsing surfaces.
 */
export class DesignTimeClient {
  public constructor(
    private readonly mockEngine: MockEngine,
    private readonly defaultTenantId: string,
  ) {}

  /**
   * Lists design-time integration applications (integration flows and other artifacts within
   * Integration Packages).
   * @param context optional tenant/correlation override.
   * @returns the application descriptors.
   */
  public listApplications(context?: ClientCallContext): Promise<readonly ApplicationDto[]> {
    const resolved = resolveContext(this.defaultTenantId, context);
    return this.mockEngine.resolve({
      operationKey: "designTime.listApplications",
      tenantId: resolved.tenantId,
      generateSuccess: () => generateApplications(10),
      generateEmpty: () => [],
      generateLarge: () => generateApplications(250),
    });
  }
}
