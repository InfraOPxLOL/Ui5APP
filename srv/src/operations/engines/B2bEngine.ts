import type { B2bMonitoringClient } from "../../sdk/client/B2bMonitoringClient.js";
import type {
  B2bInterchange,
  B2bInterchangeFilter,
  B2bPayloadContent,
  ProviderPage,
} from "../../core/providers/types.js";
import type {
  InterchangeDetailDto,
  InterchangePayloadContentDto,
  InterchangePayloadFormat,
  InterchangeStatusCategory,
  InterchangeStatusSummary,
  InterchangeSummary,
} from "../dto/B2bDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import type { OperationsCache } from "../cache/index.js";
import { calculateDurationMs, formatDurationHuman } from "../transform/index.js";

/**
 * Prepares Trading Partner Management B2B Monitor data (interchanges, payloads, processing events)
 * for the Report Server and for linking failed queue messages back to their interchange.
 */
export class B2bEngine {
  public constructor(
    private readonly client: B2bMonitoringClient,
    private readonly cache: OperationsCache,
  ) {}

  /**
   * Lists interchanges newest first.
   * @param filter the server-side filter.
   * @param page the requested window.
   * @returns the page plus the total matching count.
   */
  public async queryInterchanges(
    filter: B2bInterchangeFilter,
    page: ProviderPage,
  ): Promise<SearchResult<InterchangeSummary>> {
    const startedAt = Date.now();
    const result = await this.client.queryInterchanges(filter, page);
    return {
      items: result.items.map(B2bEngine.toSummary),
      total: result.total,
      tookMs: Date.now() - startedAt,
    };
  }

  /**
   * Counts interchanges per status over the newest `limit` matching rows.
   * @param filter the server-side filter.
   * @param limit the maximum number of rows to count.
   * @returns the counts, largest first.
   */
  public async getStatusSummary(
    filter: B2bInterchangeFilter,
    limit = 2000,
  ): Promise<InterchangeStatusSummary> {
    const statuses = await this.client.listStatuses(filter, limit + 1);
    const counted = statuses.slice(0, limit);
    const counts = new Map<string, number>();
    for (const status of counted) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return {
      counts: [...counts.entries()]
        .map(([status, count]) => ({ status, category: B2bEngine.categorize(status), count }))
        .sort((a, b) => b.count - a.count),
      total: counted.length,
      truncated: statuses.length > limit,
    };
  }

  /**
   * Reads one interchange with its events, payload metadata and errors.
   * @param id the interchange id.
   * @returns the detail, or `undefined` when unknown.
   */
  public async getInterchange(id: string): Promise<InterchangeDetailDto | undefined> {
    const detail = await this.client.getInterchange(id);
    if (detail === undefined) {
      return undefined;
    }
    return {
      interchange: B2bEngine.toSummary(detail.interchange),
      events: detail.events.map((event) => ({ ...event })),
      payloads: detail.payloads.map((payload) => ({ ...payload })),
      errors: detail.errors.map((error) => ({ ...error })),
    };
  }

  /**
   * Reads one stored payload with its content.
   * @param payloadEntityId the payload key.
   * @returns the payload, or `undefined` when unknown.
   */
  public async getPayload(
    payloadEntityId: string,
  ): Promise<InterchangePayloadContentDto | undefined> {
    const payload = await this.client.getPayload(payloadEntityId);
    return payload === undefined ? undefined : B2bEngine.toPayloadContent(payload);
  }

  /**
   * Finds the interchange an MPL belongs to.
   * @param mplId the MPL message id.
   * @returns the interchange, or `undefined` when the MPL is not linked to one.
   */
  public async findInterchangeByMplId(mplId: string): Promise<InterchangeSummary | undefined> {
    return this.cache.dedupe(`b2b.byMpl:${mplId}`, async () => {
      const interchange = await this.client.findInterchangeByMplId(mplId);
      return interchange === undefined ? undefined : B2bEngine.toSummary(interchange);
    });
  }

  /**
   * Coarse status grouping. The B2B Monitor's status vocabulary is not published, so this matches
   * meaning-bearing fragments and falls back to `"unknown"` rather than guessing.
   * @param status the status exactly as the tenant reports it.
   * @returns the display category.
   */
  public static categorize(status: string | undefined): InterchangeStatusCategory {
    const normalized = (status ?? "").toLowerCase();
    if (/fail|error|reject|abort|cancel/.test(normalized)) {
      return "error";
    }
    if (/complet|success|deliver|done|processed/.test(normalized)) {
      return "success";
    }
    if (/retr|wait|process|pend|progress|running|sched/.test(normalized)) {
      return "inProgress";
    }
    return "unknown";
  }

  private static toSummary(this: void, raw: B2bInterchange): InterchangeSummary {
    const durationMs =
      raw.startedAt !== undefined && raw.endedAt !== undefined
        ? calculateDurationMs(raw.startedAt, raw.endedAt)
        : undefined;
    return {
      id: raw.id,
      overallStatus: raw.overallStatus,
      statusCategory: B2bEngine.categorize(raw.overallStatus),
      processingStatus: raw.processingStatus,
      startedAt: raw.startedAt,
      endedAt: raw.endedAt,
      durationMs,
      durationHuman: formatDurationHuman(durationMs),
      direction: raw.direction,
      interchangeName: raw.interchangeName,
      agreementTypeName: raw.agreementTypeName,
      transactionTypeName: raw.transactionTypeName,
      transactionDocumentType: raw.transactionDocumentType,
      receiverTechnicalAckStatus: raw.receiverTechnicalAckStatus,
      receiverFunctionalAckStatus: raw.receiverFunctionalAckStatus,
      retryAllowed: raw.retryAllowed,
      resendAllowed: raw.resendAllowed,
      sender: { ...raw.sender },
      receiver: { ...raw.receiver },
    };
  }

  private static toPayloadContent(raw: B2bPayloadContent): InterchangePayloadContentDto {
    return {
      ...raw,
      format: B2bEngine.formatOf(raw),
      sizeBytes:
        raw.encoding === "base64"
          ? Buffer.from(raw.content, "base64").byteLength
          : Buffer.byteLength(raw.content, "utf8"),
    };
  }

  private static formatOf(raw: B2bPayloadContent): InterchangePayloadFormat {
    if (raw.encoding === "base64") {
      return "binary";
    }
    const type = (raw.contentType ?? "").toLowerCase();
    const head = raw.content.trimStart().slice(0, 4);
    if (type.includes("xml") || head.startsWith("<")) {
      return "xml";
    }
    if (type.includes("json") || head.startsWith("{") || head.startsWith("[")) {
      return "json";
    }
    if (type.includes("edi") || type.includes("x12") || head === "ISA*" || head.startsWith("UN")) {
      return "edi";
    }
    return "text";
  }
}
