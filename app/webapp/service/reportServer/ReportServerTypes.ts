import type { TimePresetKey } from "../../core/utils/TimePresets";

/** Client-side mirrors of the Report Server API (`/api/v1/report-server`). */

export type InterchangeStatusCategory = "success" | "error" | "inProgress" | "unknown";

export interface InterchangeParty {
  readonly tradingPartnerName?: string;
  readonly communicationPartnerName?: string;
  readonly systemId?: string;
  readonly adapterType?: string;
  readonly documentStandard?: string;
  readonly messageType?: string;
  readonly interchangeControlNumber?: string;
  readonly groupControlNumber?: string;
  readonly messageNumber?: string;
}

export interface Interchange {
  readonly id: string;
  readonly overallStatus: string;
  readonly statusCategory: InterchangeStatusCategory;
  readonly processingStatus?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly durationHuman: string;
  readonly direction?: string;
  readonly interchangeName?: string;
  readonly agreementTypeName?: string;
  readonly transactionTypeName?: string;
  readonly transactionDocumentType?: string;
  readonly receiverTechnicalAckStatus?: string;
  readonly receiverFunctionalAckStatus?: string;
  readonly retryAllowed: boolean;
  readonly resendAllowed: boolean;
  readonly sender: InterchangeParty;
  readonly receiver: InterchangeParty;
}

export interface InterchangeEvent {
  readonly id: string;
  readonly eventType: string;
  readonly date?: string;
  readonly monitoringType?: string;
  readonly monitoringId?: string;
}

export interface InterchangePayload {
  readonly id: string;
  readonly payloadId?: string;
  readonly direction?: string;
  readonly processingState?: string;
  readonly contentType?: string;
  readonly containerContentType?: string;
}

export type InterchangePayloadFormat = "edi" | "xml" | "json" | "text" | "binary";

export interface InterchangePayloadContent extends InterchangePayload {
  readonly content: string;
  readonly encoding: "text" | "base64";
  readonly format: InterchangePayloadFormat;
  readonly sizeBytes: number;
}

export interface InterchangeError {
  readonly id: string;
  readonly errorInformation: string;
  readonly errorCategory?: string;
  readonly transientError?: boolean;
}

export interface LinkedProcessingLog {
  readonly mplId: string;
  readonly firstEventAt?: string;
  readonly lastEventAt?: string;
  readonly eventTypes: readonly string[];
}

export interface InterchangeDetail {
  readonly interchange: Interchange;
  readonly events: readonly InterchangeEvent[];
  readonly payloads: readonly InterchangePayload[];
  readonly errors: readonly InterchangeError[];
  readonly linkedProcessingLogs: readonly LinkedProcessingLog[];
}

export interface InterchangeListResponse {
  readonly items: readonly Interchange[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly tookMs: number;
}

export interface InterchangeStatusCount {
  readonly status: string;
  readonly category: InterchangeStatusCategory;
  readonly count: number;
}

export interface InterchangeStatusSummary {
  readonly counts: readonly InterchangeStatusCount[];
  readonly total: number;
  readonly truncated: boolean;
}

/** The text filters a user can set (empty string = not set). */
export interface ReportServerTextFilters {
  status: string;
  senderPartner: string;
  receiverPartner: string;
  documentStandard: string;
  messageType: string;
  controlNumber: string;
  // Advanced search
  interchangeId: string;
  mplId: string;
  direction: string;
  agreement: string;
  transactionType: string;
  interchangeName: string;
  systemId: string;
  adapterType: string;
  groupControlNumber: string;
  messageNumber: string;
  processingStatus: string;
  technicalAckStatus: string;
  functionalAckStatus: string;
}

/** The filters as held in the view model: a time window plus the text filters. */
export interface ReportServerFilters extends ReportServerTextFilters {
  timePreset: TimePresetKey;
  /** Explicit bounds; only used when `timePreset` is `custom`. */
  dateFrom: Date | null;
  dateTo: Date | null;
}

/** The query-string form of {@link ReportServerFilters}. */
export type ReportServerQuery = {
  readonly [K in keyof ReportServerTextFilters]?: string;
} & {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page?: number;
  readonly pageSize?: number;
};

/** What a saved view or a shared link restores: dates as ISO strings, so it survives JSON. */
export interface ReportServerViewState {
  readonly filters: Omit<ReportServerFilters, "dateFrom" | "dateTo"> & {
    readonly dateFrom: string | null;
    readonly dateTo: string | null;
  };
  /** Whether the advanced search fields were open. */
  readonly advanced: boolean;
}
