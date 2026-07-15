import { UpstreamError } from "../errors/UpstreamError.js";

/** Options for a single {@link RestClient} request. */
export interface RestRequestOptions<TBody = unknown> {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: TBody;
  /** Request timeout in milliseconds (default 30s). */
  readonly timeoutMs?: number;
}

/**
 * Low-level authenticated REST/HTTP client used to talk to external systems (Integration Suite,
 * SAP Alert Notification Service, etc). It is a thin, typed wrapper over the platform `fetch` that
 * assembles query strings, applies a timeout, and normalizes any non-2xx response into an
 * {@link UpstreamError} — so callers never handle raw upstream error shapes.
 */
export class RestClient {
  /**
   * Issues a request and parses a JSON response.
   * @param url the absolute request URL.
   * @param options the request options.
   * @returns the parsed response body typed as `T`.
   * @throws {UpstreamError} for transport failures or non-2xx responses.
   */
  public async request<T, TBody = unknown>(
    url: string,
    options: RestRequestOptions<TBody> = {},
  ): Promise<T> {
    const fullUrl = RestClient.applyQuery(url, options.query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      throw new UpstreamError(504, "The upstream request failed or timed out.", undefined, cause);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw UpstreamError.fromResponse(response.status, await RestClient.safeBody(response));
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private static applyQuery(url: string, query?: RestRequestOptions["query"]): string {
    if (query === undefined) {
      return url;
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        search.append(key, String(value));
      }
    }
    const qs = search.toString();
    return qs === "" ? url : `${url}${url.includes("?") ? "&" : "?"}${qs}`;
  }

  private static async safeBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
