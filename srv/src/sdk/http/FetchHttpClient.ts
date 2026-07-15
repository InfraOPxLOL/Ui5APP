import type { IHttpClient } from "./IHttpClient.js";
import type { IHttpInterceptor } from "./interceptors/IHttpInterceptor.js";
import {
  DEFAULT_RETRY_POLICY,
  type HttpRequestBody,
  type HttpRequestOptions,
  type HttpResponse,
  type RetryPolicy,
} from "./HttpTypes.js";
import type { OperationContext } from "../models/OperationContext.js";
import { RetryExecutor, type AttemptOutcome } from "./RetryExecutor.js";
import { HttpErrorTranslator } from "../errors/HttpErrorTranslator.js";

/** Configuration for a {@link FetchHttpClient} instance. */
export interface FetchHttpClientOptions {
  /** Default per-request timeout, in milliseconds (default 30s). */
  readonly defaultTimeoutMs?: number;
  /** Default retry policy applied when a request specifies none. */
  readonly defaultRetryPolicy?: RetryPolicy;
  /** Interceptors run around every request, in registration order (see {@link IHttpInterceptor}). */
  readonly interceptors?: readonly IHttpInterceptor[];
}

/**
 * The SDK's concrete {@link IHttpClient}, built on the platform `fetch` global.
 *
 * Owns everything the HTTP Infrastructure mandate requires (§1): connection/request timeout with
 * cancellation, retry with exponential backoff, compression negotiation, JSON/XML/multipart/binary
 * body encoding, the interceptor chain (correlation id, logging, metrics — see `interceptors/`),
 * and streaming responses. This is the *only* class in the SDK that calls the platform `fetch`;
 * every higher layer (REST, OData, providers) goes through an `IHttpClient` instance.
 */
export class FetchHttpClient implements IHttpClient {
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetryPolicy: RetryPolicy;
  private readonly interceptors: readonly IHttpInterceptor[];

  public constructor(options: FetchHttpClientOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
    this.defaultRetryPolicy = options.defaultRetryPolicy ?? DEFAULT_RETRY_POLICY;
    this.interceptors = options.interceptors ?? [];
  }

  /** @inheritdoc */
  public async execute(
    options: HttpRequestOptions,
    context: OperationContext,
  ): Promise<HttpResponse> {
    context.startedAt = Date.now();
    const policy: RetryPolicy = { ...this.defaultRetryPolicy, ...options.retry };
    const endpoint = FetchHttpClient.endpointOf(options.url);
    context.bag.method = options.method;
    context.bag.endpoint = endpoint;

    const requestAfterBefore = await this.runBeforeRequest(options, context);

    const { attempts, result, error } = await RetryExecutor.run<HttpResponse>(
      policy,
      async (attemptNumber) => {
        context.attempt = attemptNumber;
        return this.attemptOnce(requestAfterBefore, policy);
      },
    );

    if (result !== undefined) {
      const finalResponse: HttpResponse = {
        ...result,
        attempts,
        durationMs: Date.now() - context.startedAt,
      };
      await this.runAfterResponse(finalResponse, context);
      return finalResponse;
    }
    await this.runOnError(error, context);
    throw error;
  }

  private async attemptOnce(
    options: HttpRequestOptions,
    policy: RetryPolicy,
  ): Promise<AttemptOutcome<HttpResponse>> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const combinedSignal = FetchHttpClient.mergeSignals(options.signal, timeoutController.signal);

    const attemptStart = Date.now();
    try {
      const fetchResponse = await fetch(FetchHttpClient.buildUrl(options), {
        method: options.method,
        headers: FetchHttpClient.buildHeaders(options),
        body: FetchHttpClient.encodeBody(options.body),
        signal: combinedSignal,
      });
      const durationMs = Date.now() - attemptStart;
      const response = await FetchHttpClient.toHttpResponse(fetchResponse, options, durationMs);
      const retryable = !response.ok && RetryExecutor.isRetryableStatus(policy, response.status);
      return { result: response, status: response.status, retryable };
    } catch (cause) {
      const isOurTimeout = timeoutController.signal.aborted;
      const translated = HttpErrorTranslator.translateTransportFailure(
        isOurTimeout ? "timeout" : "network",
        isOurTimeout ? timeoutMs : cause,
      );
      return { error: translated, retryable: policy.retryOnNetworkError };
    } finally {
      clearTimeout(timer);
    }
  }

  private async runBeforeRequest(
    options: HttpRequestOptions,
    context: OperationContext,
  ): Promise<HttpRequestOptions> {
    let current = options;
    for (const interceptor of this.interceptors) {
      if (interceptor.beforeRequest !== undefined) {
        current = await interceptor.beforeRequest(current, context);
      }
    }
    return current;
  }

  private async runAfterResponse(response: HttpResponse, context: OperationContext): Promise<void> {
    for (const interceptor of [...this.interceptors].reverse()) {
      await interceptor.afterResponse?.(response, context);
    }
  }

  private async runOnError(error: unknown, context: OperationContext): Promise<void> {
    for (const interceptor of [...this.interceptors].reverse()) {
      await interceptor.onError?.(error, context);
    }
  }

  private static buildUrl(options: HttpRequestOptions): string {
    if (options.query === undefined) {
      return options.url;
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        search.append(key, String(value));
      }
    }
    const qs = search.toString();
    return qs === "" ? options.url : `${options.url}${options.url.includes("?") ? "&" : "?"}${qs}`;
  }

  private static buildHeaders(options: HttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.compress !== false) {
      headers["Accept-Encoding"] = "gzip, br";
    }
    if (options.body !== undefined) {
      headers["Content-Type"] ??= FetchHttpClient.contentTypeFor(options.body);
    }
    return headers;
  }

  private static contentTypeFor(body: HttpRequestBody): string {
    switch (body.encoding) {
      case "json":
        return "application/json";
      case "xml":
        return "application/xml";
      case "text":
        return "text/plain";
      case "binary":
        return "application/octet-stream";
      case "multipart":
        // The boundary is generated by FormData itself; no explicit Content-Type header is set for
        // multipart bodies (the platform fetch implementation supplies its own with a boundary).
        return "";
      default:
        return "application/octet-stream";
    }
  }

  private static encodeBody(
    body: HttpRequestBody | undefined,
  ): string | Uint8Array | FormData | undefined {
    if (body === undefined) {
      return undefined;
    }
    switch (body.encoding) {
      case "json":
        return JSON.stringify(body.value);
      case "xml":
      case "text":
        return body.value;
      case "binary":
        return body.value instanceof Uint8Array ? body.value : new Uint8Array(body.value);
      case "multipart": {
        const form = new FormData();
        for (const field of body.value) {
          if (typeof field.value === "string") {
            form.append(field.name, field.value);
          } else {
            form.append(field.name, field.value, field.fileName);
          }
        }
        return form;
      }
      default:
        return undefined;
    }
  }

  private static async toHttpResponse(
    response: Response,
    options: HttpRequestOptions,
    durationMs: number,
  ): Promise<HttpResponse> {
    const headers = new Map<string, string>();
    response.headers.forEach((value, key) => headers.set(key, value));
    const base = {
      status: response.status,
      headers,
      ok: response.ok,
      attempts: 1,
      durationMs,
    };
    if (options.stream === true && response.body !== null) {
      return { ...base, bodyStream: response.body };
    }
    if (options.binaryResponse === true) {
      return { ...base, bodyBinary: new Uint8Array(await response.arrayBuffer()) };
    }
    return { ...base, bodyText: await response.text() };
  }

  private static mergeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
    if (a === undefined) {
      return b;
    }
    const merged = new AbortController();
    const abort = (): void => merged.abort();
    if (a.aborted || b.aborted) {
      merged.abort();
    } else {
      a.addEventListener("abort", abort, { once: true });
      b.addEventListener("abort", abort, { once: true });
    }
    return merged.signal;
  }

  private static endpointOf(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }
}
