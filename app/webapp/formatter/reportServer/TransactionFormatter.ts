import TimePresets, { type TimePresetKey } from "../../core/utils/TimePresets";
import type {
  JmsStage,
  TransactionFilters,
  TransactionQuery,
  TransactionStatusCategory,
  TransactionSummary,
} from "../../service/reportServer/TransactionTypes";

/** A status tile of the non-B2B list: counts of the transactions loaded so far. */
export interface TransactionTile {
  readonly key: "" | TransactionStatusCategory;
  readonly count: number;
  readonly valueColor: "Good" | "Error" | "Critical" | "Neutral";
}

/** What a saved view or a shared link restores: dates as ISO strings, so it survives JSON. */
export interface TransactionViewState {
  readonly filters: Omit<TransactionFilters, "dateFrom" | "dateTo"> & {
    readonly dateFrom: string | null;
    readonly dateTo: string | null;
  };
  readonly advanced: boolean;
}

const DEFAULT_TIME_PRESET: TimePresetKey = "1d";

/** Fields behind the "more filters" toggle. */
const ADVANCED_FIELDS = ["correlationId", "mplId", "applicationId", "messageType"] as const;

/** Every text filter sent to the API. */
const TEXT_FIELDS = [
  "status",
  "sender",
  "receiver",
  "integrationFlow",
  "framework",
  ...ADVANCED_FIELDS,
] as const;

const STAGE_STATE: Readonly<Record<JmsStage, string>> = {
  delivered: "Success",
  queued: "Information",
  retrying: "Warning",
  failed: "Error",
};

const TILE_COLOR: Readonly<Record<TransactionStatusCategory, TransactionTile["valueColor"]>> = {
  success: "Good",
  error: "Error",
  inProgress: "Critical",
  unknown: "Neutral",
};

/**
 * Pure formatting for the non-B2B Report Server (transactions folded from processing logs). No UI5
 * imports, so every function is unit-testable.
 */
export default class TransactionFormatter {
  /** The filters of a fresh screen: the last 24 hours, nothing else set. */
  public static defaultFilters(): TransactionFilters {
    return {
      timePreset: DEFAULT_TIME_PRESET,
      dateFrom: null,
      dateTo: null,
      status: "",
      sender: "",
      receiver: "",
      integrationFlow: "",
      framework: "",
      correlationId: "",
      mplId: "",
      applicationId: "",
      messageType: "",
    };
  }

  /** Turns the filters into query parameters; a relative window resolves against `now`. */
  public static toQuery(
    filters: TransactionFilters,
    page?: number,
    pageSize?: number,
    now: Date = new Date(),
  ): TransactionQuery {
    const query: Record<string, string | number> = {};
    const window = TimePresets.resolve(
      TimePresets.isKey(filters.timePreset) ? filters.timePreset : "custom",
      { from: filters.dateFrom, to: filters.dateTo },
      now,
    );
    if (window.from !== undefined) {
      query.dateFrom = window.from.toISOString();
    }
    if (window.to !== undefined) {
      query.dateTo = window.to.toISOString();
    }
    for (const field of TEXT_FIELDS) {
      const value = String(filters[field] ?? "").trim();
      if (value !== "") {
        query[field] = value;
      }
    }
    if (page !== undefined) {
      query.page = page;
    }
    if (pageSize !== undefined) {
      query.pageSize = pageSize;
    }
    return query as TransactionQuery;
  }

  /** How many advanced fields are set — shown on the "more filters" toggle. */
  public static advancedCount(filters: TransactionFilters | undefined): number {
    return ADVANCED_FIELDS.filter((field) => (filters?.[field] ?? "").trim() !== "").length;
  }

  public static toViewState(filters: TransactionFilters, advanced: boolean): TransactionViewState {
    return {
      filters: {
        ...filters,
        dateFrom: filters.dateFrom?.toISOString() ?? null,
        dateTo: filters.dateTo?.toISOString() ?? null,
      },
      advanced,
    };
  }

  /** Restores a saved view or shared link; anything missing or malformed falls back to the default. */
  public static fromViewState(state: unknown): { filters: TransactionFilters; advanced: boolean } {
    const filters = TransactionFormatter.defaultFilters();
    const source = (state as Partial<TransactionViewState> | undefined)?.filters as
      | Record<string, unknown>
      | undefined;
    if (source !== undefined && source !== null && typeof source === "object") {
      for (const field of TEXT_FIELDS) {
        const value = source[field];
        if (typeof value === "string") {
          (filters as unknown as Record<string, string>)[field] = value;
        }
      }
      if (!["", "jms", "router", "none"].includes(filters.framework)) {
        filters.framework = "";
      }
      if (TimePresets.isKey(source.timePreset)) {
        filters.timePreset = source.timePreset;
      }
      filters.dateFrom = TransactionFormatter.toDate(source.dateFrom);
      filters.dateTo = TransactionFormatter.toDate(source.dateTo);
    }
    const advanced =
      (state as Partial<TransactionViewState> | undefined)?.advanced === true ||
      TransactionFormatter.advancedCount(filters) > 0;
    return { filters, advanced };
  }

  /**
   * Adds a newly loaded page to the rows already shown: one row per correlation id (the fresher
   * reading wins — a later page can hold more of a chain), newest activity first.
   */
  public static merge(
    existing: readonly TransactionSummary[],
    incoming: readonly TransactionSummary[],
  ): TransactionSummary[] {
    const byId = new Map(existing.map((row) => [row.correlationId, row]));
    for (const row of incoming) {
      const known = byId.get(row.correlationId);
      if (known === undefined || row.stepCount >= known.stepCount) {
        byId.set(row.correlationId, row);
      }
    }
    return [...byId.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }

  /** Status tiles over the loaded rows: all, then each category that occurs. */
  public static tiles(rows: readonly TransactionSummary[]): TransactionTile[] {
    const counts = new Map<TransactionStatusCategory, number>();
    for (const row of rows) {
      counts.set(row.statusCategory, (counts.get(row.statusCategory) ?? 0) + 1);
    }
    const order: TransactionStatusCategory[] = ["success", "error", "inProgress", "unknown"];
    return [
      { key: "", count: rows.length, valueColor: "Neutral" },
      ...order
        .filter((category) => (counts.get(category) ?? 0) > 0)
        .map((category) => ({
          key: category,
          count: counts.get(category) ?? 0,
          valueColor: TILE_COLOR[category],
        })),
    ];
  }

  /** The rows a status tile selects. */
  public static byCategory(
    rows: readonly TransactionSummary[],
    category: "" | TransactionStatusCategory,
  ): TransactionSummary[] {
    return category === "" ? [...rows] : rows.filter((row) => row.statusCategory === category);
  }

  /** "Common IDoc Router (BTP_IS_CORE_LA) → JMS · Common_JMS_ID_NA_P1 → IF_Order_to_SFDC". */
  public static pathText(path: readonly string[] | undefined): string {
    return (path ?? []).join(" → ");
  }

  /** `ObjectStatus.state` for a JMS stage. */
  public static jmsStageState(stage: JmsStage | undefined): string {
    return stage === undefined ? "None" : (STAGE_STATE[stage] ?? "None");
  }

  private static toDate(value: unknown): Date | null {
    if (typeof value !== "string" || value === "") {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
