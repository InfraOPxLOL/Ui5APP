import TimePresets, { type TimePresetKey } from "../../core/utils/TimePresets";
import type {
  InterchangeParty,
  InterchangePayloadFormat,
  InterchangeStatusCategory,
  InterchangeStatusSummary,
  ReportServerFilters,
  ReportServerQuery,
  ReportServerTextFilters,
  ReportServerViewState,
} from "../../service/reportServer/ReportServerTypes";

/** The window a fresh screen opens with. */
const DEFAULT_TIME_PRESET: TimePresetKey = "1d";

/** Fields behind the "more filters" toggle. */
const ADVANCED_FILTER_FIELDS: readonly (keyof ReportServerTextFilters)[] = [
  "interchangeId",
  "mplId",
  "direction",
  "agreement",
  "transactionType",
  "interchangeName",
  "systemId",
  "adapterType",
  "groupControlNumber",
  "messageNumber",
  "processingStatus",
  "technicalAckStatus",
  "functionalAckStatus",
];

/** Every text filter, in query order. */
const TEXT_FILTER_FIELDS: readonly (keyof ReportServerTextFilters)[] = [
  "status",
  "senderPartner",
  "receiverPartner",
  "documentStandard",
  "messageType",
  "controlNumber",
  ...ADVANCED_FILTER_FIELDS,
];

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

  /** The filters of a fresh screen: the last 24 hours, nothing else set. */
  public static defaultFilters(): ReportServerFilters {
    const text = Object.fromEntries(
      TEXT_FILTER_FIELDS.map((field) => [field, ""]),
    ) as unknown as ReportServerTextFilters;
    return { ...text, timePreset: DEFAULT_TIME_PRESET, dateFrom: null, dateTo: null };
  }

  /**
   * Turns the view-model filters into query parameters, dropping everything not set. A relative
   * time preset is resolved against `now` here, at search time.
   */
  public static toQuery(
    filters: ReportServerFilters,
    page?: number,
    pageSize?: number,
    now: Date = new Date(),
  ): ReportServerQuery {
    const query: Record<string, string | number> = {};
    const set = (key: string, value: string | number | undefined): void => {
      if (value !== undefined) {
        query[key] = value;
      }
    };
    const window = TimePresets.resolve(
      TimePresets.isKey(filters.timePreset) ? filters.timePreset : "custom",
      { from: filters.dateFrom, to: filters.dateTo },
      now,
    );
    set("dateFrom", window.from?.toISOString());
    set("dateTo", window.to?.toISOString());
    for (const field of TEXT_FILTER_FIELDS) {
      const trimmed = (filters[field] ?? "").trim();
      set(field, trimmed === "" ? undefined : trimmed);
    }
    set("page", page);
    set("pageSize", pageSize);
    return query as ReportServerQuery;
  }

  /** How many advanced-search fields are set — shown on the "more filters" toggle. */
  public static advancedCount(filters: ReportServerFilters | undefined): number {
    return ADVANCED_FILTER_FIELDS.filter((field) => (filters?.[field] ?? "").trim() !== "").length;
  }

  /** The JSON-safe state a saved view or shared link carries. */
  public static toViewState(
    filters: ReportServerFilters,
    advanced: boolean,
  ): ReportServerViewState {
    return {
      filters: {
        ...filters,
        dateFrom: filters.dateFrom?.toISOString() ?? null,
        dateTo: filters.dateTo?.toISOString() ?? null,
      },
      advanced,
    };
  }

  /**
   * Restores a saved view or shared link. Tolerant by design — anything missing or malformed
   * (an older view, a hand-edited link) falls back to the default for that field.
   */
  public static fromViewState(state: unknown): {
    filters: ReportServerFilters;
    advanced: boolean;
  } {
    const filters = ReportServerFormatter.defaultFilters();
    const source = (state as Partial<ReportServerViewState> | undefined)?.filters as
      | Record<string, unknown>
      | undefined;
    if (source !== undefined && source !== null && typeof source === "object") {
      for (const field of TEXT_FILTER_FIELDS) {
        const value = source[field];
        if (typeof value === "string") {
          filters[field] = value;
        }
      }
      if (TimePresets.isKey(source.timePreset)) {
        filters.timePreset = source.timePreset;
      }
      filters.dateFrom = ReportServerFormatter.toDate(source.dateFrom);
      filters.dateTo = ReportServerFormatter.toDate(source.dateTo);
    }
    const advanced =
      (state as Partial<ReportServerViewState> | undefined)?.advanced === true ||
      ReportServerFormatter.advancedCount(filters) > 0;
    return { filters, advanced };
  }

  private static toDate(value: unknown): Date | null {
    if (typeof value !== "string" || value === "") {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
