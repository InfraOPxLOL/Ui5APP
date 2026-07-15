/** HTTP verbs the SDK's HTTP layer supports. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** How the request body should be encoded on the wire. Content negotiation lives here, not in the transport logic itself. */
export type BodyEncoding = "json" | "xml" | "multipart" | "binary" | "text";

/** A single part of a multipart body. */
export interface MultipartField {
  readonly name: string;
  readonly value: string | Blob;
  readonly fileName?: string;
  readonly contentType?: string;
}

/** The request body accepted by the HTTP layer, already encoded per {@link BodyEncoding}. */
export type HttpRequestBody =
  | { readonly encoding: "json"; readonly value: unknown }
  | { readonly encoding: "xml" | "text"; readonly value: string }
  | { readonly encoding: "binary"; readonly value: ArrayBuffer | Uint8Array }
  | { readonly encoding: "multipart"; readonly value: readonly MultipartField[] };

/** Options for a single {@link IHttpClient} request. */
export interface HttpRequestOptions {
  readonly method: HttpMethod;
  /** Absolute request URL. */
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: HttpRequestBody;
  /** Overrides the client's default request timeout for this call, in milliseconds. */
  readonly timeoutMs?: number;
  /** Overrides the client's default retry policy for this call. */
  readonly retry?: Partial<RetryPolicy>;
  /** Caller-supplied cancellation signal, honoured in addition to the internal timeout signal. */
  readonly signal?: AbortSignal;
  /** Whether to request gzip/br compression via `Accept-Encoding` (default true). */
  readonly compress?: boolean;
  /**
   * When set, the response body is exposed as a stream ({@link HttpResponse.bodyStream}) instead of
   * being buffered — for large payload downloads.
   */
  readonly stream?: boolean;
  /**
   * When set (and `stream` is not), the response body is buffered as raw bytes
   * ({@link HttpResponse.bodyBinary}) instead of decoded as text — required for binary payloads
   * (certificates, attachments) where text decoding would corrupt non-UTF8 bytes.
   */
  readonly binaryResponse?: boolean;
}

/** Retry policy governing automatic re-attempts of a failed request. */
export interface RetryPolicy {
  /** Maximum number of attempts including the first (1 = no retries). */
  readonly maxAttempts: number;
  /** Base delay before the first retry, in milliseconds. */
  readonly baseDelayMs: number;
  /** Multiplier applied to the delay after each retry (exponential backoff). */
  readonly backoffFactor: number;
  /** Upper bound on any single retry delay, in milliseconds. */
  readonly maxDelayMs: number;
  /** HTTP status codes considered retryable (typically 429 and 5xx). */
  readonly retryableStatusCodes: readonly number[];
  /** Whether network/timeout failures (no response at all) are retried. */
  readonly retryOnNetworkError: boolean;
}

/** The default retry policy applied when a request specifies none. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  backoffFactor: 2,
  maxDelayMs: 5000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

/** The raw HTTP response returned by {@link IHttpClient}, before REST/OData-level parsing. */
export interface HttpResponse {
  readonly status: number;
  readonly headers: ReadonlyMap<string, string>;
  readonly ok: boolean;
  /** Buffered response body as text (absent when `stream` or `binaryResponse` was requested). */
  readonly bodyText?: string;
  /** Readable stream of the response body (present only when `stream: true` was requested). */
  readonly bodyStream?: ReadableStream<Uint8Array>;
  /** Buffered response body as raw bytes (present only when `binaryResponse: true` was requested). */
  readonly bodyBinary?: Uint8Array;
  /** Number of attempts made to obtain this response (1 = succeeded first try). */
  readonly attempts: number;
  /** Total wall-clock duration across all attempts, in milliseconds. */
  readonly durationMs: number;
}
