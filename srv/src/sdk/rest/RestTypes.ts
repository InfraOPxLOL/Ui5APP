import type { RetryPolicy } from "../http/HttpTypes.js";
import type { MultipartField } from "../http/HttpTypes.js";

/** How the REST framework should encode a request body / decode a response body. */
export type RestContentType = "json" | "xml" | "text";

/** Options accepted by every {@link SdkRestClient} call. */
export interface RestRequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** Request/response body encoding (default `"json"`). */
  readonly contentType?: RestContentType;
  readonly timeoutMs?: number;
  readonly retry?: Partial<RetryPolicy>;
  readonly signal?: AbortSignal;
}

export type { MultipartField };
