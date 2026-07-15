import { RestClient, type RestRequestOptions } from "./RestClient.js";
import { resolveDestination } from "../../config/destinations.js";

/** Options for an Integration Suite call. */
export interface CpiRequestOptions<TBody = unknown> {
  /** Target tenant id; the default tenant is used when omitted. */
  readonly tenantId?: string;
  /** OData/REST query parameters. */
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Request body for mutating verbs. */
  readonly body?: TBody;
  /** Correlation id to propagate to CPI for cross-system tracing. */
  readonly correlationId?: string;
}

/**
 * The single authenticated gateway to SAP Integration Suite.
 *
 * Backend module services call CPI **only** through this client. It resolves the tenant's
 * destination (base URL + auth headers) via the Destination service, propagates the correlation id
 * so a request can be traced across both systems' logs (architecture §10), and delegates transport
 * and error normalization to {@link RestClient}. Because every CPI call funnels here, destination
 * resolution and auth are wired in exactly one place.
 */
export class IntegrationSuiteClient {
  public constructor(private readonly rest: RestClient = new RestClient()) {}

  /**
   * Performs a GET against a CPI resource path.
   * @param path resource path relative to the tenant base URL (leading slash optional).
   * @param options request options.
   * @returns the parsed response typed as `T`.
   */
  public async get<T>(path: string, options: CpiRequestOptions = {}): Promise<T> {
    return this.send<T>("GET", path, options);
  }

  /**
   * Performs a POST against a CPI resource path.
   * @param path resource path relative to the tenant base URL.
   * @param options request options (including body).
   * @returns the parsed response typed as `T`.
   */
  public async post<T, B = unknown>(path: string, options: CpiRequestOptions<B> = {}): Promise<T> {
    return this.send<T, B>("POST", path, options);
  }

  private async send<T, B = unknown>(
    method: NonNullable<RestRequestOptions["method"]>,
    path: string,
    options: CpiRequestOptions<B>,
  ): Promise<T> {
    const destination = await resolveDestination(options.tenantId);
    const url = `${destination.url.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    const headers: Record<string, string> = { ...destination.headers };
    if (options.correlationId !== undefined) {
      headers["X-Correlation-Id"] = options.correlationId;
    }
    return this.rest.request<T, B>(url, {
      method,
      headers,
      query: options.query,
      body: options.body,
    });
  }
}

/** Shared client instance for backend module services. */
export const integrationSuiteClient = new IntegrationSuiteClient();
