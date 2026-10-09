import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { B2bInterchangeFilter } from "../../core/providers/types.js";
import type { InterchangeEventDto } from "../../operations/dto/index.js";
import { HttpError } from "../../core/errors/HttpError.js";
import type {
  LinkedProcessingLog,
  ReportServerDetail,
  ReportServerListResponse,
  ReportServerPayload,
  ReportServerSummary,
} from "./dto.js";

const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const DEFAULT_PAGE_SIZE = 50;

/** Filters accepted by the list and summary endpoints (already validated). */
export interface ReportServerFilterQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly status?: string;
  readonly senderPartner?: string;
  readonly receiverPartner?: string;
  readonly documentStandard?: string;
  readonly messageType?: string;
  readonly controlNumber?: string;
  readonly interchangeId?: string;
  /** A processing log id; resolved to the interchange it belongs to. */
  readonly mplId?: string;
  readonly direction?: string;
  readonly agreement?: string;
  readonly transactionType?: string;
  readonly interchangeName?: string;
  readonly systemId?: string;
  readonly adapterType?: string;
  readonly groupControlNumber?: string;
  readonly messageNumber?: string;
  readonly processingStatus?: string;
  readonly technicalAckStatus?: string;
  readonly functionalAckStatus?: string;
}

export interface ReportServerListQuery extends ReportServerFilterQuery {
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Report Server: every B2B interchange recorded by Trading Partner Management's B2B Monitor, with
 * its payloads, processing events and linked processing logs. Builds a request-scoped engine per
 * call, like every other module service.
 */
export class ReportServerService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /** Lists interchanges newest first. */
  public async list(query: ReportServerListQuery): Promise<ReportServerListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const engine = this.engineFactory();
    const filter = await ReportServerService.guard(() =>
      ReportServerService.toFilter(engine, query),
    );
    if (filter === undefined) {
      return { items: [], total: 0, page, pageSize, tookMs: 0 };
    }
    const result = await ReportServerService.guard(() =>
      engine.b2b.queryInterchanges(filter, { skip: (page - 1) * pageSize, top: pageSize }),
    );
    return { items: result.items, total: result.total, page, pageSize, tookMs: result.tookMs };
  }

  /** Counts interchanges per status for the KPI strip. */
  public async summary(query: ReportServerFilterQuery): Promise<ReportServerSummary> {
    const engine = this.engineFactory();
    const filter = await ReportServerService.guard(() =>
      ReportServerService.toFilter(engine, query),
    );
    if (filter === undefined) {
      return { counts: [], total: 0, truncated: false };
    }
    return ReportServerService.guard(() => engine.b2b.getStatusSummary(filter));
  }

  /** One interchange with events, payloads, errors and the processing logs its events reference. */
  public async getById(interchangeId: string): Promise<ReportServerDetail> {
    const detail = await ReportServerService.guard(() =>
      this.engineFactory().b2b.getInterchange(interchangeId),
    );
    if (detail === undefined) {
      throw HttpError.notFound(`Interchange "${interchangeId}" was not found.`);
    }
    return { ...detail, linkedProcessingLogs: ReportServerService.linkedLogs(detail.events) };
  }

  /** One stored payload of an interchange, with its content. */
  public async getPayload(interchangeId: string, payloadId: string): Promise<ReportServerPayload> {
    const payload = await ReportServerService.guard(() =>
      this.engineFactory().b2b.getPayload(payloadId),
    );
    if (payload === undefined) {
      throw HttpError.notFound(
        `Payload "${payloadId}" of interchange "${interchangeId}" was not found.`,
      );
    }
    return payload;
  }

  /**
   * Maps the query onto the B2B filter. A processing log id is resolved to its interchange first;
   * `undefined` means it belongs to none (or to a different one than `interchangeId` names), so
   * nothing can match.
   */
  private static async toFilter(
    engine: OperationsEngine,
    query: ReportServerFilterQuery,
  ): Promise<B2bInterchangeFilter | undefined> {
    let interchangeId = query.interchangeId;
    if (query.mplId !== undefined) {
      const linked = await engine.b2b.findInterchangeByMplId(query.mplId);
      if (linked === undefined || (interchangeId !== undefined && interchangeId !== linked.id)) {
        return undefined;
      }
      interchangeId = linked.id;
    }
    return {
      from: query.dateFrom,
      to: query.dateTo,
      overallStatus: query.status,
      senderPartner: query.senderPartner,
      receiverPartner: query.receiverPartner,
      documentStandard: query.documentStandard,
      messageType: query.messageType,
      controlNumber: query.controlNumber,
      interchangeId,
      direction: query.direction,
      agreementTypeName: query.agreement,
      transactionTypeName: query.transactionType,
      interchangeName: query.interchangeName,
      systemId: query.systemId,
      adapterType: query.adapterType,
      groupControlNumber: query.groupControlNumber,
      messageNumber: query.messageNumber,
      processingStatus: query.processingStatus,
      technicalAckStatus: query.technicalAckStatus,
      functionalAckStatus: query.functionalAckStatus,
    };
  }

  /** Groups processing events by the MPL they reference, oldest run first. */
  private static linkedLogs(events: readonly InterchangeEventDto[]): LinkedProcessingLog[] {
    const byMpl = new Map<string, InterchangeEventDto[]>();
    for (const event of events) {
      if (event.monitoringId === undefined) {
        continue;
      }
      const group = byMpl.get(event.monitoringId) ?? [];
      group.push(event);
      byMpl.set(event.monitoringId, group);
    }
    return [...byMpl.entries()]
      .map(([mplId, group]) => {
        const dates = group
          .map((event) => event.date ?? "")
          .filter((date) => date !== "")
          .sort();
        return {
          mplId,
          firstEventAt: dates[0],
          lastEventAt: dates.at(-1),
          eventTypes: [...new Set(group.map((event) => event.eventType))],
        };
      })
      .sort((a, b) => (a.firstEventAt ?? "").localeCompare(b.firstEventAt ?? ""));
  }

  /**
   * Translates the tenant's "no B2B data store" failure (TPM not activated) into a 503 the UI can
   * explain, instead of a generic upstream error.
   */
  private static async guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (ReportServerService.isB2bUnavailable(error)) {
        throw new HttpError(
          503,
          "B2B_MONITORING_UNAVAILABLE",
          "B2B monitoring is not available on this tenant. Trading Partner Management must be activated in Integration Suite.",
        );
      }
      throw error;
    }
  }

  private static isB2bUnavailable(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const details = (error as { details?: unknown }).details;
    const text = `${error.message} ${typeof details === "string" ? details : JSON.stringify(details ?? "")}`;
    return text.includes("Can't get a DataSource");
  }
}

export const reportServerService = new ReportServerService();
