/**
 * Transport-level types shared by every frontend service and the {@link module:com/middlewareops/integrationportal/core/services/http/ApiClient}.
 * These mirror the stable response envelope produced by the backend's terminal error middleware
 * and paginated list endpoints, so no service ever parses a raw CPI payload shape.
 */

/** Supported HTTP verbs for the {@link ApiClient}. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Options accepted by a single {@link ApiClient} request. */
export interface ApiRequestOptions<TBody = unknown> {
  readonly method?: HttpMethod;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: TBody;
  readonly headers?: Readonly<Record<string, string>>;
  /** Abort signal so callers (e.g. a closing view) can cancel in-flight requests. */
  readonly signal?: AbortSignal;
}

/**
 * The normalized error envelope returned by the backend for any non-2xx response.
 * Mirrors `srv/core/errors` output.
 */
export interface ApiErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: unknown;
}

/**
 * Standard shape for a server-paginated list response. Monitoring lists never return unbounded
 * result sets; they page through this envelope.
 */
export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly skip: number;
  readonly top: number;
}
