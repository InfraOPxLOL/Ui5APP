import type { BatchOperationResult, BatchResponse } from "../models/BatchResponse.js";

const BOUNDARY_FROM_CONTENT_TYPE = /boundary=([^\s;]+)/i;
const HTTP_STATUS_LINE = /^HTTP\/1\.\d\s+(\d{3})/m;

/**
 * Parses a `multipart/mixed` OData `$batch` response back into one {@link BatchOperationResult}
 * per submitted operation, in submission order (architecture: OData Framework, §5 — "Batch
 * requests"). Pairs with {@link ODataBatchBuilder}, which builds the corresponding request.
 */
export class ODataBatchResponseParser {
  /**
   * Parses a batch response body.
   * @param bodyText the raw multipart response body.
   * @param contentTypeHeader the response's `Content-Type` header (carries the boundary).
   * @param correlationId the correlation id to attach to the normalized response.
   * @param durationMs the call duration to attach to the normalized response.
   * @returns the normalized batch response.
   * @throws {Error} when the boundary cannot be determined from the content type.
   */
  public static parse<T = unknown>(
    bodyText: string,
    contentTypeHeader: string,
    correlationId: string,
    durationMs: number,
  ): BatchResponse<T> {
    const boundaryMatch = BOUNDARY_FROM_CONTENT_TYPE.exec(contentTypeHeader);
    if (boundaryMatch?.[1] === undefined) {
      throw new Error(
        `Could not determine batch boundary from Content-Type: "${contentTypeHeader}"`,
      );
    }
    const boundary = boundaryMatch[1].replace(/^"|"$/g, "");
    const parts = bodyText
      .split(`--${boundary}`)
      .map((part) => part.trim())
      .filter((part) => part !== "" && part !== "--");

    return {
      correlationId,
      durationMs,
      mocked: false,
      results: parts.map((part) => ODataBatchResponseParser.parsePart<T>(part)),
    };
  }

  private static parsePart<T>(part: string): BatchOperationResult<T> {
    const statusMatch = HTTP_STATUS_LINE.exec(part);
    const status = statusMatch?.[1] !== undefined ? Number.parseInt(statusMatch[1], 10) : 500;
    const jsonStart = part.indexOf("{");
    const jsonBody = jsonStart >= 0 ? part.slice(jsonStart).trim() : "";

    if (status >= 200 && status < 300) {
      return { success: true, status, data: ODataBatchResponseParser.safeParseJson<T>(jsonBody) };
    }
    return { success: false, status, error: jsonBody !== "" ? jsonBody : `HTTP ${status}` };
  }

  private static safeParseJson<T>(text: string): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }
}
