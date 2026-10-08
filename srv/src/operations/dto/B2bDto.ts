/**
 * DTOs for Trading Partner Management's B2B Monitor (Report Server). Status strings are passed
 * through exactly as the tenant reports them; `statusCategory` is a coarse, display-only grouping.
 */

/** Coarse grouping of an interchange status for colouring and KPI tiles. */
export type InterchangeStatusCategory = "success" | "error" | "inProgress" | "unknown";

export interface InterchangePartyDto {
  readonly tradingPartnerName: string | undefined;
  readonly communicationPartnerName: string | undefined;
  readonly systemId: string | undefined;
  readonly adapterType: string | undefined;
  readonly documentStandard: string | undefined;
  readonly messageType: string | undefined;
  readonly interchangeControlNumber: string | undefined;
  readonly groupControlNumber: string | undefined;
  readonly messageNumber: string | undefined;
}

export interface InterchangeSummary {
  readonly id: string;
  readonly overallStatus: string;
  readonly statusCategory: InterchangeStatusCategory;
  readonly processingStatus: string | undefined;
  readonly startedAt: string | undefined;
  readonly endedAt: string | undefined;
  readonly durationMs: number | undefined;
  readonly durationHuman: string;
  readonly direction: string | undefined;
  readonly interchangeName: string | undefined;
  readonly agreementTypeName: string | undefined;
  readonly transactionTypeName: string | undefined;
  readonly transactionDocumentType: string | undefined;
  readonly receiverTechnicalAckStatus: string | undefined;
  readonly receiverFunctionalAckStatus: string | undefined;
  readonly retryAllowed: boolean;
  readonly resendAllowed: boolean;
  readonly sender: InterchangePartyDto;
  readonly receiver: InterchangePartyDto;
}

export interface InterchangeEventDto {
  readonly id: string;
  readonly eventType: string;
  readonly date: string | undefined;
  readonly monitoringType: string | undefined;
  readonly monitoringId: string | undefined;
}

export interface InterchangePayloadDto {
  readonly id: string;
  readonly payloadId: string | undefined;
  readonly direction: string | undefined;
  readonly processingState: string | undefined;
  readonly contentType: string | undefined;
  readonly containerContentType: string | undefined;
}

/** How a payload body should be rendered. */
export type InterchangePayloadFormat = "edi" | "xml" | "json" | "text" | "binary";

export interface InterchangePayloadContentDto extends InterchangePayloadDto {
  readonly content: string;
  readonly encoding: "text" | "base64";
  readonly format: InterchangePayloadFormat;
  readonly sizeBytes: number;
}

export interface InterchangeErrorDto {
  readonly id: string;
  readonly errorInformation: string;
  readonly errorCategory: string | undefined;
  readonly transientError: boolean | undefined;
}

export interface InterchangeDetailDto {
  readonly interchange: InterchangeSummary;
  readonly events: readonly InterchangeEventDto[];
  readonly payloads: readonly InterchangePayloadDto[];
  readonly errors: readonly InterchangeErrorDto[];
}

export interface InterchangeStatusCount {
  readonly status: string;
  readonly category: InterchangeStatusCategory;
  readonly count: number;
}

/** Status counts over a window. `truncated` means more interchanges exist than were counted. */
export interface InterchangeStatusSummary {
  readonly counts: readonly InterchangeStatusCount[];
  readonly total: number;
  readonly truncated: boolean;
}
