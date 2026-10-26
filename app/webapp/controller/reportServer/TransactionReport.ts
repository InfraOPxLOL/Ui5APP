import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type View from "sap/ui/core/mvc/View";
import type GenericTile from "sap/m/GenericTile";
import ExportHelper from "../../core/utils/ExportHelper";
import TransactionService from "../../service/reportServer/TransactionService";
import TransactionFormatter, {
  type TransactionTile,
  type TransactionViewState,
} from "../../formatter/reportServer/TransactionFormatter";
import type TransactionPanel from "../shared/TransactionPanel";
import type JourneyPanel from "../shared/JourneyPanel";
import type {
  TransactionFilters,
  TransactionStatusCategory,
  TransactionSummary,
} from "../../service/reportServer/TransactionTypes";

const PAGE_SIZE = 50;

/** State of the non-B2B report, exposed to the view as the `nb` model. */
export interface TransactionReportState {
  busy: boolean;
  filters: TransactionFilters;
  advanced: boolean;
  advancedCount: number;
  /** Every transaction loaded so far (merged across pages). */
  rows: TransactionSummary[];
  /** The rows the status tile selects. */
  items: TransactionSummary[];
  tiles: TransactionTile[];
  tileFilter: "" | TransactionStatusCategory;
  page: number;
  hasMore: boolean;
  logsTotal: number;
  showingText: string;
  selectedId: string;
}

/** What the presenter needs from the Report Server controller. */
export interface TransactionReportHost {
  /** The Report Server's own texts. */
  text(key: string, args?: (string | number)[]): string;
  handleError(error: unknown): void;
  /** Called when the user changes a filter, so the view selector shows the view as modified. */
  markModified(): void;
}

/**
 * Presenter for the non-B2B Report Server (`fragment/reportServer/TransactionReport`): every other
 * transaction, read from the processing logs and folded by correlation id, with a time window,
 * filters, status tiles and the shared transaction panel as detail.
 *
 * The Report Server controller exposes an instance as its `nb` property; handlers are arrow
 * functions so they keep this instance as `this` when UI5 calls them with the controller as context.
 */
export default class TransactionReport {
  public readonly model = new JSONModel(TransactionReport.initialState());

  /** Formatters the fragment binds to as `.nb.fmt.*`. */
  public readonly fmt = {
    pathText: (path?: readonly string[]): string => TransactionFormatter.pathText(path),
    tileHeader: (key?: string): string =>
      this.host.text(key === undefined || key === "" ? "nb.kpi.all" : `nb.kpi.${key}`),
    documentText: (messageType?: string, applicationId?: string): string =>
      [messageType, applicationId].filter((part) => part !== undefined && part !== "").join(" · "),
  };

  private readonly service = new TransactionService();
  private abort: AbortController | undefined;
  private applying = false;
  private loaded = false;

  public constructor(
    private readonly host: TransactionReportHost,
    private readonly panel: TransactionPanel,
    private readonly journey?: JourneyPanel,
  ) {
    this.model.attachPropertyChange((event: Event) => {
      const path = String(event.getParameter("path" as never) ?? "");
      const context = event.getParameter("context" as never) as { getPath(): string } | undefined;
      const fullPath = context === undefined ? path : `${context.getPath()}/${path}`;
      if (!this.applying && fullPath.startsWith("/filters")) {
        this.model.setProperty(
          "/advancedCount",
          TransactionFormatter.advancedCount(this.filters()),
        );
        this.host.markModified();
      }
    });
  }

  /** Attaches the `nb` model. */
  public attach(view: View): void {
    view.setModel(this.model, "nb");
  }

  /** Loads the first page the first time the non-B2B category is shown. */
  public ensureLoaded(): void {
    if (!this.loaded) {
      void this.reload();
    }
  }

  /** The state a saved view or shared link carries. */
  public viewState(): TransactionViewState {
    return TransactionFormatter.toViewState(this.filters(), this.state<boolean>("/advanced"));
  }

  /** Applies a saved view, shared link or the defaults, then searches. */
  public apply(state: unknown, search = true): void {
    const restored =
      state === undefined
        ? { filters: TransactionFormatter.defaultFilters(), advanced: false }
        : TransactionFormatter.fromViewState(state);
    this.applying = true;
    try {
      this.model.setProperty("/filters", restored.filters);
      this.model.setProperty("/advanced", restored.advanced);
      this.model.setProperty(
        "/advancedCount",
        TransactionFormatter.advancedCount(restored.filters),
      );
    } finally {
      this.applying = false;
    }
    if (search) {
      void this.reload();
    }
  }

  /** Finds and opens one transaction (a deep link by correlation id). */
  public async openByCorrelationId(correlationId: string): Promise<void> {
    this.apply(
      {
        filters: { ...TransactionFormatter.defaultFilters(), timePreset: "all", correlationId },
        advanced: true,
      },
      false,
    );
    await this.reload();
    this.model.setProperty("/selectedId", correlationId);
    void this.panel.load(correlationId);
    void this.journey?.show({ correlationId });
  }

  public readonly onSearch = (): void => {
    void this.reload();
  };

  public readonly onClear = (): void => {
    this.apply(undefined);
    this.host.markModified();
  };

  public readonly onTimePresetChange = (): void => {
    if (this.filters().timePreset !== "custom") {
      void this.reload();
    }
  };

  public readonly onLoadMore = (): void => {
    void this.loadPage(this.state<number>("/page") + 1, true);
  };

  /** A status tile narrows the loaded rows to that status ("all" clears it). */
  public readonly onTilePress = (event: Event): void => {
    const tile = event.getSource() as unknown as GenericTile;
    const category = String(tile.data("category") ?? "") as "" | TransactionStatusCategory;
    this.model.setProperty("/tileFilter", category);
    this.applyTileFilter();
  };

  public readonly onSelect = (event: Event): void => {
    const item = event.getParameter("listItem" as never) as
      | { getBindingContext(name: string): { getObject(): unknown } | null | undefined }
      | undefined;
    const row = item?.getBindingContext("nb")?.getObject() as TransactionSummary | undefined;
    if (row !== undefined) {
      this.model.setProperty("/selectedId", row.correlationId);
      void this.panel.load(row.correlationId);
      void this.journey?.show({ correlationId: row.correlationId });
    }
  };

  /** Exports the loaded transactions as CSV. */
  public exportCsv(): void {
    const rows = this.state<TransactionSummary[]>("/items").map((row) => ({
      status: row.status,
      lastActivity: row.lastActivityAt,
      businessFlow: row.businessFlow ?? "",
      path: TransactionFormatter.pathText(row.path),
      sender: row.sender,
      receiver: row.receiver,
      messageType: row.messageType ?? "",
      applicationId: row.applicationId ?? "",
      jmsQueue: row.jms?.queue ?? "",
      correlationId: row.correlationId,
    }));
    type Row = (typeof rows)[number];
    const columns = (Object.keys(rows[0] ?? {}) as (keyof Row)[]).map((property) => ({
      property,
      label: String(property),
    }));
    ExportHelper.exportCsv(rows, columns, "report-server-transactions");
  }

  /** Whether any rows are loaded (for the export button). */
  public hasRows(): boolean {
    return this.state<TransactionSummary[]>("/items").length > 0;
  }

  private async reload(): Promise<void> {
    this.loaded = true;
    this.model.setProperty("/tileFilter", "");
    await this.loadPage(1, false);
  }

  private async loadPage(page: number, append: boolean): Promise<void> {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.model.setProperty("/busy", true);
    try {
      const response = await this.service.list(
        TransactionFormatter.toQuery(this.filters(), page, PAGE_SIZE),
        abort.signal,
      );
      const rows = append
        ? TransactionFormatter.merge(this.state<TransactionSummary[]>("/rows"), response.items)
        : TransactionFormatter.merge([], response.items);
      this.model.setProperty("/rows", rows);
      this.model.setProperty("/page", response.page);
      this.model.setProperty("/hasMore", response.hasMore);
      this.model.setProperty("/logsTotal", response.logsTotal);
      this.model.setProperty("/tiles", TransactionFormatter.tiles(rows));
      this.model.setProperty(
        "/showingText",
        this.host.text("nb.list.showing", [
          rows.length,
          Math.min(response.page * PAGE_SIZE, response.logsTotal),
          response.logsTotal,
        ]),
      );
      this.applyTileFilter();
      if (!append) {
        this.panel.clear();
        this.journey?.clear();
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.host.handleError(error);
      }
    } finally {
      if (this.abort === abort) {
        this.model.setProperty("/busy", false);
      }
    }
  }

  private applyTileFilter(): void {
    this.model.setProperty(
      "/items",
      TransactionFormatter.byCategory(
        this.state<TransactionSummary[]>("/rows"),
        this.state<"" | TransactionStatusCategory>("/tileFilter"),
      ),
    );
  }

  private filters(): TransactionFilters {
    return this.state<TransactionFilters>("/filters");
  }

  private state<T>(path: string): T {
    return this.model.getProperty(path) as T;
  }

  private static initialState(): TransactionReportState {
    return {
      busy: false,
      filters: TransactionFormatter.defaultFilters(),
      advanced: false,
      advancedCount: 0,
      rows: [],
      items: [],
      tiles: [],
      tileFilter: "",
      page: 1,
      hasMore: false,
      logsTotal: 0,
      showingText: "",
      selectedId: "",
    };
  }
}
