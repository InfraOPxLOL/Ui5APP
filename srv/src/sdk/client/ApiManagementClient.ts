import type { ApiDto } from "../dto/ApiDto.js";
import type { MockEngine } from "../mock/MockEngine.js";
import { generateApis } from "../mock/fixtures/index.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * API Management sub-client (architecture: Integration Suite Client, §4 — `ApiManagementClient`).
 * No Phase-3 provider contract exists for API Management (it was outside that phase's monitoring
 * scope), so this client generates its {@link ApiDto} data directly through the {@link MockEngine}
 * rather than through a domain provider — a future phase can introduce `IApiManagementProvider`
 * without changing this client's public shape.
 */
export class ApiManagementClient {
  public constructor(
    private readonly mockEngine: MockEngine,
    private readonly defaultTenantId: string,
  ) {}

  /**
   * Lists published API proxies and their current-day traffic summary.
   * @param context optional tenant/correlation override.
   * @returns the API descriptors.
   */
  public listApis(context?: ClientCallContext): Promise<readonly ApiDto[]> {
    const resolved = resolveContext(this.defaultTenantId, context);
    return this.mockEngine.resolve({
      operationKey: "apiManagement.listApis",
      tenantId: resolved.tenantId,
      generateSuccess: () => generateApis(12),
      generateEmpty: () => [],
      generateLarge: () => generateApis(250),
    });
  }
}
