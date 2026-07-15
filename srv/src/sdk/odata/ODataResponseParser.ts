import type { ODataResponse } from "../models/ODataResponse.js";
import type { PagedResponse } from "../models/PagedResponse.js";
import { ODataError } from "../errors/ODataError.js";

/** Shape of a v2 OData JSON response body (`{ d: { results, __count, __next } }`). */
interface ODataV2Envelope<T> {
  readonly d: {
    readonly results: readonly T[];
    readonly __count?: string;
    readonly __next?: string;
  };
}

/** Shape of a v4 OData JSON response body (`{ value, "@odata.count", "@odata.nextLink" }`). */
interface ODataV4Envelope<T> {
  readonly value: readonly T[];
  readonly "@odata.count"?: number;
  readonly "@odata.nextLink"?: string;
}

/**
 * Parses a raw OData JSON response body into the normalized {@link ODataResponse} shape,
 * auto-detecting v2 (`d.results`) vs v4 (`value`) envelopes so callers never branch on protocol
 * version themselves (architecture: OData Framework, §5 — "Paging", "Continuation tokens").
 */
export class ODataResponseParser {
  /**
   * Parses a response body.
   * @param bodyText the raw JSON response body text.
   * @param correlationId the correlation id to attach to the normalized response.
   * @param durationMs the call duration to attach to the normalized response.
   * @param mocked whether this response was served by the mock engine.
   * @returns the normalized OData response.
   * @throws {ODataError} when the body is not valid JSON, or lacks a recognizable v2/v4 envelope.
   */
  public static parse<T>(
    bodyText: string,
    correlationId: string,
    durationMs: number,
    mocked = false,
  ): ODataResponse<T> {
    let parsed: ODataV2Envelope<T> | ODataV4Envelope<T>;
    try {
      parsed = JSON.parse(bodyText) as ODataV2Envelope<T> | ODataV4Envelope<T>;
    } catch (cause) {
      throw new ODataError("The OData response body is not valid JSON.", { bodyText }, cause);
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      (!("d" in parsed) && !("value" in parsed))
    ) {
      throw new ODataError(
        "The OData response body does not match a recognizable v2 (`d.results`) or v4 (`value`) envelope.",
        { bodyText },
      );
    }
    const base = { correlationId, durationMs, mocked };
    if (ODataResponseParser.isV2(parsed)) {
      return {
        ...base,
        value: parsed.d.results,
        count: parsed.d.__count !== undefined ? Number.parseInt(parsed.d.__count, 10) : undefined,
        nextLink: parsed.d.__next,
      };
    }
    return {
      ...base,
      value: parsed.value,
      count: parsed["@odata.count"],
      nextLink: parsed["@odata.nextLink"],
    };
  }

  /**
   * Converts a parsed {@link ODataResponse} into the platform-standard {@link PagedResponse},
   * given the `$skip`/`$top` that were requested (OData responses don't echo these back).
   * @param response the parsed OData response.
   * @param skip the `$skip` that was sent.
   * @param top the `$top` that was sent.
   * @returns the equivalent paged response.
   */
  public static toPagedResponse<T>(
    response: ODataResponse<T>,
    skip: number,
    top: number,
  ): PagedResponse<T> {
    return {
      correlationId: response.correlationId,
      durationMs: response.durationMs,
      mocked: response.mocked,
      items: response.value,
      total: response.count ?? skip + response.value.length,
      skip,
      top,
    };
  }

  private static isV2<T>(
    value: ODataV2Envelope<T> | ODataV4Envelope<T>,
  ): value is ODataV2Envelope<T> {
    return "d" in value;
  }
}
