import type {
  InterchangeDetailDto,
  InterchangePayloadContentDto,
  InterchangeStatusSummary,
  InterchangeSummary,
} from "../../operations/dto/index.js";

/** One page of the Report Server interchange list. */
export interface ReportServerListResponse {
  readonly items: readonly InterchangeSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly tookMs: number;
}

/** An MPL run the interchange's processing events point at, derived from those events. */
export interface LinkedProcessingLog {
  readonly mplId: string;
  readonly firstEventAt: string | undefined;
  readonly lastEventAt: string | undefined;
  readonly eventTypes: readonly string[];
}

/** Interchange detail plus the processing logs its events reference. */
export interface ReportServerDetail extends InterchangeDetailDto {
  readonly linkedProcessingLogs: readonly LinkedProcessingLog[];
}

export type ReportServerSummary = InterchangeStatusSummary;
export type ReportServerPayload = InterchangePayloadContentDto;
