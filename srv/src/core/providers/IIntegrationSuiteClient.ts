import type { ProviderContext } from "./types.js";

/**
 * Abstract transport contract to an SAP Integration Suite tenant.
 *
 * This is the seam every concrete provider is built on: implementations own destination
 * resolution, authentication, retries and error normalization (throwing `IntegrationSuiteError`,
 * never raw HTTP errors). Domain providers (`IMonitoringProvider`, `IJmsProvider`, …) depend on
 * this interface — never on a concrete HTTP client — so transports can be swapped (real CPI,
 * recorded fixtures, in-memory test doubles) without touching any domain code.
 *
 * No implementation exists in this phase; the interface deliberately mirrors the minimal verb set
 * CPI's OData/REST APIs require.
 */
export interface IIntegrationSuiteClient {
  /**
   * Executes a GET against a tenant-relative resource path.
   * @param context the tenant/correlation context.
   * @param path resource path relative to the tenant base URL.
   * @param query optional query parameters (OData system options included).
   * @returns the parsed response body typed as `T`.
   */
  get<T>(
    context: ProviderContext,
    path: string,
    query?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): Promise<T>;

  /**
   * Executes a POST against a tenant-relative resource path.
   * @param context the tenant/correlation context.
   * @param path resource path relative to the tenant base URL.
   * @param body optional JSON request body.
   * @returns the parsed response body typed as `T`.
   */
  post<T, B = unknown>(context: ProviderContext, path: string, body?: B): Promise<T>;

  /**
   * Executes a DELETE against a tenant-relative resource path.
   * @param context the tenant/correlation context.
   * @param path resource path relative to the tenant base URL.
   */
  delete(context: ProviderContext, path: string): Promise<void>;
}
