import type { IHttpClient } from "../http/IHttpClient.js";
import type { HttpMethod, HttpRequestBody, MultipartField } from "../http/HttpTypes.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { ApiResponse } from "../models/ApiResponse.js";
import type { ErrorResponse } from "../models/ErrorResponse.js";
import type { RestRequestOptions } from "./RestTypes.js";
import { HttpErrorTranslator } from "../errors/HttpErrorTranslator.js";

/** Shape a JSON error body commonly takes; extracted defensively (never assumed present). */
interface JsonErrorBody {
  readonly message?: string;
  readonly error?: { readonly message?: string; readonly code?: string };
  readonly code?: string;
}

/**
 * The SDK's generic REST framework (architecture: REST Framework, §6).
 *
 * Sits directly on {@link IHttpClient} and adds what a plain REST call needs beyond raw transport:
 * automatic JSON serialization/deserialization (XML and plain text pass through as strings —
 * see `sdk/odata` for structured XML metadata parsing), multipart form submission, binary
 * downloads, and translation of any non-2xx response into the SDK's typed error taxonomy via
 * {@link HttpErrorTranslator} — callers never see a raw status code or parse an error body
 * themselves. Every REST-based sub-client and provider is built on an `SdkRestClient` instance;
 * OData-based ones additionally layer `sdk/odata` on top of the same instance.
 */
export class SdkRestClient {
  public constructor(private readonly httpClient: IHttpClient) {}

  /** Performs a GET request expecting a JSON/text/XML body. */
  public get<T>(
    url: string,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.send<T>("GET", url, context, options);
  }

  /** Performs a POST request with a JSON/text/XML body. */
  public post<T, B = unknown>(
    url: string,
    body: B,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.send<T, B>("POST", url, context, options, body);
  }

  /** Performs a PUT request with a JSON/text/XML body. */
  public put<T, B = unknown>(
    url: string,
    body: B,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.send<T, B>("PUT", url, context, options, body);
  }

  /** Performs a PATCH request with a JSON/text/XML body. */
  public patch<T, B = unknown>(
    url: string,
    body: B,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.send<T, B>("PATCH", url, context, options, body);
  }

  /** Performs a DELETE request. */
  public delete<T>(
    url: string,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.send<T>("DELETE", url, context, options);
  }

  /**
   * Submits a `multipart/form-data` request (e.g. uploading a certificate or payload attachment).
   * @param url the absolute request URL.
   * @param fields the multipart fields.
   * @param context the operation context.
   * @param options request options (content-type is ignored — the body is always multipart).
   * @returns the parsed response.
   */
  public async postMultipart<T>(
    url: string,
    fields: readonly MultipartField[],
    context: OperationContext,
    options?: Omit<RestRequestOptions, "contentType">,
  ): Promise<ApiResponse<T>> {
    const response = await this.httpClient.execute(
      {
        method: "POST",
        url,
        headers: options?.headers,
        query: options?.query,
        body: { encoding: "multipart", value: fields },
        timeoutMs: options?.timeoutMs,
        retry: options?.retry,
        signal: options?.signal,
      },
      context,
    );
    if (!response.ok) {
      throw HttpErrorTranslator.translate(
        context.request.tenantId,
        this.toErrorResponse(response.status, response.bodyText),
      );
    }
    return {
      data: SdkRestClient.parseJson<T>(response.bodyText),
      correlationId: context.request.correlationId,
      durationMs: response.durationMs,
      mocked: false,
    };
  }

  /**
   * Downloads a binary resource (certificate content, payload attachment) as raw bytes.
   * @param url the absolute request URL.
   * @param context the operation context.
   * @param options request options.
   * @returns the response with `data` as a `Uint8Array`.
   */
  public async getBinary(
    url: string,
    context: OperationContext,
    options?: RestRequestOptions,
  ): Promise<ApiResponse<Uint8Array>> {
    const response = await this.httpClient.execute(
      {
        method: "GET",
        url,
        headers: options?.headers,
        query: options?.query,
        binaryResponse: true,
        timeoutMs: options?.timeoutMs,
        retry: options?.retry,
        signal: options?.signal,
      },
      context,
    );
    if (!response.ok) {
      throw HttpErrorTranslator.translate(
        context.request.tenantId,
        this.toErrorResponse(response.status, undefined),
      );
    }
    return {
      data: response.bodyBinary ?? new Uint8Array(0),
      correlationId: context.request.correlationId,
      durationMs: response.durationMs,
      mocked: false,
    };
  }

  private async send<T, B = undefined>(
    method: HttpMethod,
    url: string,
    context: OperationContext,
    options?: RestRequestOptions,
    body?: B,
  ): Promise<ApiResponse<T>> {
    const response = await this.httpClient.execute(
      {
        method,
        url,
        headers: options?.headers,
        query: options?.query,
        body: SdkRestClient.encodeBody(body, options?.contentType ?? "json"),
        timeoutMs: options?.timeoutMs,
        retry: options?.retry,
        signal: options?.signal,
      },
      context,
    );

    if (!response.ok) {
      throw HttpErrorTranslator.translate(
        context.request.tenantId,
        this.toErrorResponse(response.status, response.bodyText),
      );
    }

    return {
      data: SdkRestClient.decodeBody<T>(response.bodyText, options?.contentType ?? "json"),
      correlationId: context.request.correlationId,
      durationMs: response.durationMs,
      mocked: false,
    };
  }

  private toErrorResponse(status: number, bodyText: string | undefined): ErrorResponse {
    const parsed = SdkRestClient.tryParseJson<JsonErrorBody>(bodyText);
    const message =
      parsed?.error?.message ??
      parsed?.message ??
      bodyText ??
      `Request failed with status ${status}.`;
    const upstreamCode = parsed?.error?.code ?? parsed?.code;
    return { httpStatus: status, message, upstreamCode, rawBody: parsed ?? bodyText };
  }

  private static encodeBody<B>(
    body: B | undefined,
    contentType: RestRequestOptions["contentType"],
  ): HttpRequestBody | undefined {
    if (body === undefined) {
      return undefined;
    }
    switch (contentType) {
      case "xml":
        return { encoding: "xml", value: body as unknown as string };
      case "text":
        return { encoding: "text", value: body as unknown as string };
      case "json":
      default:
        return { encoding: "json", value: body };
    }
  }

  private static decodeBody<T>(
    bodyText: string | undefined,
    contentType: RestRequestOptions["contentType"],
  ): T {
    if (contentType === "xml" || contentType === "text") {
      return (bodyText ?? "") as unknown as T;
    }
    return SdkRestClient.parseJson<T>(bodyText);
  }

  private static parseJson<T>(bodyText: string | undefined): T {
    if (bodyText === undefined || bodyText === "") {
      return undefined as T;
    }
    return JSON.parse(bodyText) as T;
  }

  private static tryParseJson<T>(bodyText: string | undefined): T | undefined {
    if (bodyText === undefined || bodyText === "") {
      return undefined;
    }
    try {
      return JSON.parse(bodyText) as T;
    } catch {
      return undefined;
    }
  }
}
