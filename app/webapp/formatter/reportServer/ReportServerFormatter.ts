import type {
  InterchangeParty,
  InterchangePayloadFormat,
  InterchangeStatusCategory,
  InterchangeStatusSummary,
  ReportServerFilters,
  ReportServerQuery,
} from "../../service/reportServer/ReportServerTypes";

/** A KPI tile: one per status the tenant actually reported, plus a leading "all" tile. */
export interface StatusTile {
  readonly key: string;
  readonly status: string;
  readonly count: number;
  readonly category: InterchangeStatusCategory | "all";
  /** `NumericContent.valueColor`. */
  readonly valueColor: "Good" | "Error" | "Critical" | "Neutral";
}

const STATE_BY_CATEGORY: Readonly<Record<InterchangeStatusCategory, string>> = {
  success: "Success",
  error: "Error",
  inProgress: "Warning",
  unknown: "None",
};

const ICON_BY_CATEGORY: Readonly<Record<InterchangeStatusCategory, string>> = {
  success: "sap-icon://sys-enter-2",
  error: "sap-icon://error",
  inProgress: "sap-icon://pending",
  unknown: "sap-icon://question-mark",
};

const COLOR_BY_CATEGORY: Readonly<Record<InterchangeStatusCategory, StatusTile["valueColor"]>> = {
  success: "Good",
  error: "Error",
  inProgress: "Critical",
  unknown: "Neutral",
};

/**
 * Pure formatting for the Report Server. No UI5 imports, so every function is unit-testable.
 */
export default class ReportServerFormatter {
  /** `ObjectStatus.state` for a status category. */
  public static statusState(category: InterchangeStatusCategory | undefined): string {
    return STATE_BY_CATEGORY[category ?? "unknown"] ?? "None";
  }

  /** `ObjectStatus.icon` for a status category. */
  public static statusIcon(category: InterchangeStatusCategory | undefined): string {
    return ICON_BY_CATEGORY[category ?? "unknown"] ?? ICON_BY_CATEGORY.unknown;
  }

  /** The partner name shown for one side, falling back to its communication partner. */
  public static partner(party: InterchangeParty | undefined): string {
    return party?.tradingPartnerName ?? party?.communicationPartnerName ?? "—";
  }

  /** "ASC-X12 · 850" for one side; whichever half is known. */
  public static document(party: InterchangeParty | undefined): string {
    const parts = [party?.documentStandard, party?.messageType].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    return parts.length === 0 ? "—" : parts.join(" · ");
  }

  /** `CodeEditor.type` for a payload format; EDI has no grammar, so it reads as plain text. */
  public static editorType(format: InterchangePayloadFormat | undefined): string {
    if (format === "xml" || format === "json") {
      return format;
    }
    return "text";
  }

  /** File extension for downloading a payload. */
  public static fileExtension(format: InterchangePayloadFormat | undefined): string {
    switch (format) {
      case "xml":
        return "xml";
      case "json":
        return "json";
      case "edi":
        return "edi";
      case "binary":
        return "bin";
      default:
        return "txt";
    }
  }

  /** Turns the view-model filters into query parameters, dropping everything not set. */
  public static toQuery(
    filters: ReportServerFilters,
    page?: number,
    pageSize?: number,
  ): ReportServerQuery {
    const text = (value: string): string | undefined => {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    };
    const query: Record<string, string | number> = {};
    const set = (key: string, value: string | number | undefined): void => {
      if (value !== undefined) {
        query[key] = value;
      }
    };
    set("dateFrom", filters.dateFrom?.toISOString());
    set("dateTo", filters.dateTo?.toISOString());
    set("status", text(filters.status));
    set("senderPartner", text(filters.senderPartner));
    set("receiverPartner", text(filters.receiverPartner));
    set("documentStandard", text(filters.documentStandard));
    set("messageType", text(filters.messageType));
    set("controlNumber", text(filters.controlNumber));
    set("page", page);
    set("pageSize", pageSize);
    return query as ReportServerQuery;
  }

  /** One tile per reported status (largest first) behind an "all" tile. */
  public static tiles(summary: InterchangeStatusSummary | undefined): StatusTile[] {
    if (summary === undefined) {
      return [];
    }
    return [
      { key: "", status: "", count: summary.total, category: "all", valueColor: "Neutral" },
      ...summary.counts.map((entry) => ({
        key: entry.status,
        status: entry.status,
        count: entry.count,
        category: entry.category,
        valueColor: COLOR_BY_CATEGORY[entry.category] ?? "Neutral",
      })),
    ];
  }
}
