import BaseService from "../../core/base/BaseService";
import type {
  InterchangeDetail,
  InterchangeListResponse,
  InterchangePayloadContent,
  InterchangeStatusSummary,
  ReportServerQuery,
} from "./ReportServerTypes";

/** Data service for the Report Server module — the only layer that calls the API client. */
export default class ReportServerService extends BaseService {
  public constructor() {
    super("/api/v1/report-server");
  }

  /** Lists interchanges newest first. */
  public list(query: ReportServerQuery, signal?: AbortSignal): Promise<InterchangeListResponse> {
    return this.client.get<InterchangeListResponse>(this.path(), {
      query: { ...query },
      signal,
    });
  }

  /** Status counts for the KPI strip, over the same filters as the list. */
  public summary(
    query: ReportServerQuery,
    signal?: AbortSignal,
  ): Promise<InterchangeStatusSummary> {
    const { page: _page, pageSize: _pageSize, ...filters } = query;
    return this.client.get<InterchangeStatusSummary>(this.path("summary"), {
      query: { ...filters },
      signal,
    });
  }

  /** One interchange with events, payloads, errors and linked processing logs. */
  public getById(interchangeId: string): Promise<InterchangeDetail> {
    return this.client.get<InterchangeDetail>(this.path(encodeURIComponent(interchangeId)));
  }

  /** One stored payload with its content. */
  public getPayload(interchangeId: string, payloadId: string): Promise<InterchangePayloadContent> {
    return this.client.get<InterchangePayloadContent>(
      this.path(`${encodeURIComponent(interchangeId)}/payloads/${encodeURIComponent(payloadId)}`),
    );
  }
}
