import { type ApiErrorEnvelope, type ApiRequestOptions, type HttpMethod } from "../../types/Api";
import {
  BackendError,
  NetworkError,
  AuthError,
  AuthorizationError,
  errorFromEnvelope,
} from "../../errors/ErrorTypes";

/**
 * The single HTTP chokepoint for the entire frontend.
 *
 * Every frontend service issues requests through this client (services are the only layer allowed
 * to). It centralizes:
 * - a per-request correlation id header (`X-Correlation-Id`) for end-to-end tracing,
 * - CSRF token fetch-and-cache for state-changing verbs (approuter/XSUAA pattern),
 * - JSON (de)serialization and query-string assembly,
 * - normalization of any non-2xx response into a typed {@link AppError} carrying the backend's
 *   correlation id, so callers never parse raw error payloads.
 *
 * Implemented as a singleton obtained via {@link ApiClient.getInstance}.
 */
export default class ApiClient {
  private static instance: ApiClient | undefined;
  private csrfToken: string | undefined;
  private readonly baseUrl = "/api/v1";
  private readonly csrfEndpoint = "/api/v1/csrf-token";

  private constructor() {
    // Singleton — use ApiClient.getInstance().
  }

  /**
   * @returns the process-wide singleton client.
   */
  public static getInstance(): ApiClient {
    ApiClient.instance ??= new ApiClient();
    return ApiClient.instance;
  }

  /**
   * Issues a request and deserializes a JSON response.
   * @param path resource path relative to `/api/v1` (leading slash optional).
   * @param options request options (method, query, body, headers, abort signal).
   * @returns the parsed response body typed as `TResponse`.
   * @throws {AppError} a typed error for any transport or non-2xx failure.
   */
  public async request<TResponse, TBody = unknown>(
    path: string,
    options: ApiRequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const method: HttpMethod = options.method ?? "GET";
    const url = this.buildUrl(path, options.query);

    let response = await this.send(url, method, options);
    // The approuter rejects a stale CSRF token with 403 + `X-CSRF-Token: Required`; fetch a fresh
    // token and retry once instead of failing every mutating request until a page reload.
    if (
      method !== "GET" &&
      response.status === 403 &&
      response.headers.get("X-CSRF-Token")?.toLowerCase() === "required"
    ) {
      this.csrfToken = undefined;
      response = await this.send(url, method, options);
    }

    if (!response.ok) {
      throw await this.toError(response);
    }
    if (response.status === 204) {
      return undefined as TResponse;
    }
    return (await response.json()) as TResponse;
  }

  /** Convenience wrapper for a GET request. */
  public get<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  /** Convenience wrapper for a POST request. */
  public post<T, B = unknown>(path: string, body?: B, options?: ApiRequestOptions<B>): Promise<T> {
    return this.request<T, B>(path, { ...options, method: "POST", body });
  }

  /** Convenience wrapper for a PUT request. */
  public put<T, B = unknown>(path: string, body?: B, options?: ApiRequestOptions<B>): Promise<T> {
    return this.request<T, B>(path, { ...options, method: "PUT", body });
  }

  /** Convenience wrapper for a DELETE request. */
  public delete<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  private buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const full = normalized.startsWith(this.baseUrl) ? normalized : `${this.baseUrl}${normalized}`;
    if (query === undefined) {
      return full;
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        search.append(key, String(value));
      }
    }
    const qs = search.toString();
    return qs ? `${full}?${qs}` : full;
  }

  private async send<TBody>(
    url: string,
    method: HttpMethod,
    options: ApiRequestOptions<TBody>,
  ): Promise<Response> {
    const headers = await this.buildHeaders(method, options.headers);
    try {
      return await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
        credentials: "same-origin",
      });
    } catch (cause) {
      throw new NetworkError("The request could not be completed.", { cause });
    }
  }

  private async buildHeaders(
    method: HttpMethod,
    extra?: Readonly<Record<string, string>>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Correlation-Id": ApiClient.newCorrelationId(),
      ...extra,
    };
    if (method !== "GET") {
      headers["X-CSRF-Token"] = await this.ensureCsrfToken();
    }
    return headers;
  }

  private async ensureCsrfToken(): Promise<string> {
    if (this.csrfToken !== undefined) {
      return this.csrfToken;
    }
    try {
      const response = await fetch(this.csrfEndpoint, {
        method: "GET",
        headers: { "X-CSRF-Token": "Fetch" },
        credentials: "same-origin",
      });
      this.csrfToken = response.headers.get("X-CSRF-Token") ?? "";
      return this.csrfToken;
    } catch (cause) {
      throw new NetworkError("Could not obtain a security token.", { cause });
    }
  }

  private async toError(response: Response): Promise<Error> {
    let envelope: ApiErrorEnvelope | undefined;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = undefined;
    }
    const correlationId =
      envelope?.correlationId ?? response.headers.get("X-Correlation-Id") ?? "n/a";
    if (response.status === 401) {
      return new AuthError(envelope?.message ?? "Your session has expired.", {
        code: envelope?.code ?? "401",
        correlationId,
      });
    }
    // 403 is "not allowed", not "logged out": a missing role, or a security token the approuter
    // refused. Reloading the page would not help the former, so it is never shown as an expiry.
    if (response.status === 403) {
      const tokenRefused = response.headers.get("X-CSRF-Token")?.toLowerCase() === "required";
      return new AuthorizationError(
        envelope?.message ??
          (tokenRefused
            ? "The request was refused because its security token was not accepted. Reload the page and try again."
            : "You are not authorized to perform this action."),
        { code: envelope?.code ?? "403", correlationId },
      );
    }
    if (envelope !== undefined) {
      return errorFromEnvelope(envelope);
    }
    return new BackendError(response.statusText || "Request failed.", {
      code: String(response.status),
      correlationId,
    });
  }

  private static newCorrelationId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
