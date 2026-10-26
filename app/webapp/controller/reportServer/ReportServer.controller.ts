import BaseController from "../../core/base/BaseController";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type GenericTile from "sap/m/GenericTile";
import MessageToast from "sap/m/MessageToast";
import ClipboardUtils from "../../core/utils/ClipboardUtils";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import ExportHelper from "../../core/utils/ExportHelper";
import TimePresets from "../../core/utils/TimePresets";
import { DateTimeFormatter } from "../../core/formatters";
import { AppError } from "../../core/errors/AppError";
import SavedViewStore, { STANDARD_VIEW_KEY } from "../../core/services/views/SavedViewStore";
import ReportServerService from "../../service/reportServer/ReportServerService";
import ReportServerFormatter from "../../formatter/reportServer/ReportServerFormatter";
import ReportServerModel, {
  emptyFilters,
  type ViewItem,
} from "../../model/reportServer/ReportServerModel";
import InterchangePanel from "../shared/InterchangePanel";
import TransactionPanel from "../shared/TransactionPanel";
import JourneyPanel from "../shared/JourneyPanel";
import TransactionReport from "./TransactionReport";
import type { TransactionViewState } from "../../formatter/reportServer/TransactionFormatter";
import type {
  Interchange,
  ReportServerFilters,
  ReportServerViewState,
} from "../../service/reportServer/ReportServerTypes";

/** Backend error code for a tenant without Trading Partner Management. */
const B2B_UNAVAILABLE = "B2B_MONITORING_UNAVAILABLE";

interface RouteArguments {
  readonly interchangeId?: string;
  readonly "?query"?: {
    /** A shared search (see {@link ReportServerController.onShareView}). */
    readonly view?: string;
    /** A processing log whose interchange should be found and opened. */
    readonly mplId?: string;
    /** `b2b` (TPM interchanges) or `nonB2b` (every other transaction). */
    readonly category?: string;
    /** A non-B2B transaction to find and open. */
    readonly correlationId?: string;
  };
}

type Category = "b2b" | "nonB2b";

/**
 * Report Server, in two categories switched in the header:
 * - **B2B** — every interchange recorded by TPM's B2B Monitor, with the shared interchange panel
 *   (sender, receiver, documents, events, errors, processing logs);
 * - **Non-B2B** — every other transaction, folded from the processing logs by correlation id, with
 *   its Common IDoc Router / JMS framework path and the shared transaction panel ({@link TransactionReport}).
 *
 * Both search over a relative time window or a custom range, with advanced fields, saved views (one
 * set per category) and shareable search links.
 *
 * @namespace com.middlewareops.integrationportal.controller.reportServer
 */
export default class ReportServerController extends BaseController {
  public readonly formatter = ReportServerFormatter;
  public readonly fmt = { dateTime: DateTimeFormatter.formatDateTime };
  /** The shared interchange panel the detail fragment binds to as `.b2b.*`. */
  public readonly b2b = new InterchangePanel({
    navigate: (route, parameters) => this.getRouter().navTo(route, parameters),
    handleError: (error) => this.getErrorHandler().handle(error),
  });

  /** The shared non-B2B transaction panel the detail fragment binds to as `.txn.*`. */
  public readonly txn = new TransactionPanel({
    navigate: (route, parameters) => this.getRouter().navTo(route, parameters),
    handleError: (error) => this.getErrorHandler().handle(error),
  });
  /** The shared journey panel the Journey tabs bind to as `.journey.*` (one per screen). */
  public readonly journey = new JourneyPanel({
    navigate: (route, parameters) => this.getRouter().navTo(route, parameters),
    handleError: (error) => this.getErrorHandler().handle(error),
  });
  /** The non-B2B report the fragment binds to as `.nb.*`. */
  public readonly nb = new TransactionReport(
    {
      text: (key, args) => this.getText(key, args),
      handleError: (error) => this.getErrorHandler().handle(error),
      markModified: () => this.model().setProperty("/viewModified", true),
    },
    this.txn,
    this.journey,
  );

  private readonly service = new ReportServerService();
  private readonly views = new SavedViewStore<ReportServerViewState>("reportServer");
  private readonly nbViews = new SavedViewStore<TransactionViewState>("reportServer.nonB2b");
  /** The selected view of the category not on screen, restored when switching back. */
  private readonly parkedSelection = new Map<Category, { key: string; modified: boolean }>();
  private listAbort: AbortController | undefined;
  private initialised = false;
  /** The last `?query` this screen acted on, so returning to it does not search again. */
  private lastQueryToken: string | undefined;
  /** Set while the model is written programmatically, so it does not count as a user edit. */
  private applying = false;

  public onInit(): void {
    const model = new ReportServerModel();
    this.setModel(model, "view");
    this.b2b.attach(this.getView()!);
    this.txn.attach(this.getView()!);
    this.nb.attach(this.getView()!);
    this.journey.attach(this.getView()!);
    model.setProperty(
      "/timePresets",
      TimePresets.ALL.map((preset) => ({
        key: preset.key,
        code: preset.code,
        text: this.getText(preset.labelKey),
      })),
    );
    model.attachPropertyChange((event: Event) => {
      const path = String(event.getParameter("path" as never) ?? "");
      const context = event.getParameter("context" as never) as { getPath(): string } | undefined;
      const fullPath = context === undefined ? path : `${context.getPath()}/${path}`;
      if (!this.applying && fullPath.startsWith("/filters")) {
        model.setProperty("/viewModified", true);
        model.setProperty("/advancedCount", ReportServerFormatter.advancedCount(this.filters()));
      }
    });
    this.refreshViews();

    this.getRouter()
      .getRoute("reportServer")
      ?.attachPatternMatched((event: Event) => {
        this.onRouteMatched((event.getParameter("arguments" as never) ?? {}) as RouteArguments);
      });
  }

  public onExit(): void {
    this.listAbort?.abort();
  }

  private onRouteMatched(args: RouteArguments): void {
    const query = args["?query"] ?? {};
    const token = JSON.stringify(query);
    const queryChanged = token !== this.lastQueryToken;
    this.lastQueryToken = token;

    const requested: Category | undefined =
      query.category === "nonB2b" || query.correlationId !== undefined
        ? "nonB2b"
        : query.category === "b2b" || query.mplId !== undefined
          ? "b2b"
          : undefined;
    if (queryChanged && requested !== undefined && requested !== this.category()) {
      this.switchCategory(requested, false);
    }

    if (query.view !== undefined && queryChanged) {
      // A shared search: apply it as an unsaved modification of the standard view.
      const shared = DeepLinkHelper.decode(query.view);
      if (this.category() === "nonB2b") {
        this.nb.apply(shared);
      } else {
        this.applyState(ReportServerFormatter.fromViewState(shared));
        void this.reload();
      }
      this.model().setProperty("/selectedViewKey", STANDARD_VIEW_KEY);
      this.model().setProperty("/viewModified", true);
      MessageToast.show(this.getText("toast.viewFromLink"));
    } else if (query.correlationId !== undefined && queryChanged) {
      this.model().setProperty("/selectedViewKey", STANDARD_VIEW_KEY);
      this.model().setProperty("/viewModified", true);
      void this.nb.openByCorrelationId(query.correlationId);
    } else if (query.mplId !== undefined && queryChanged) {
      void this.openByProcessingLog(query.mplId);
    } else if (!this.initialised) {
      this.selectView(this.model().getProperty("/defaultViewKey") as string);
    }
    this.initialised = true;

    if (args.interchangeId !== undefined && args.interchangeId !== "") {
      void this.openDetail(args.interchangeId);
    }
  }

  // --- Search -----------------------------------------------------------------

  public onRefresh(): void {
    if (this.category() === "nonB2b") {
      this.nb.onSearch();
      return;
    }
    void this.reload();
  }

  /** The B2B / Non-B2B switch in the header. */
  public onCategoryChange(): void {
    const category = this.category();
    const previous: Category = category === "nonB2b" ? "b2b" : "nonB2b";
    this.parkedSelection.set(previous, {
      key: this.state<string>("/selectedViewKey"),
      modified: this.state<boolean>("/viewModified"),
    });
    this.switchCategory(category, true);
  }

  /**
   * Shows a category: its saved views in the view selector and — the first time — its default
   * view. A category already shown keeps the search it had.
   */
  private switchCategory(category: Category, fromSwitch: boolean): void {
    this.model().setProperty("/category", category);
    // One journey panel serves both categories: show the transaction selected in this one.
    const selected =
      category === "nonB2b"
        ? String(this.nb.model.getProperty("/selectedId") ?? "")
        : String(this.state<string | undefined>("/selectedId") ?? "");
    void this.journey.show(
      selected === ""
        ? undefined
        : category === "nonB2b"
          ? { correlationId: selected }
          : { interchangeId: selected },
    );
    this.refreshViews();
    const parked = this.parkedSelection.get(category);
    if (parked !== undefined) {
      this.model().setProperty("/selectedViewKey", parked.key);
      this.model().setProperty("/viewModified", parked.modified);
      return;
    }
    if (fromSwitch) {
      this.selectView(this.state<string>("/defaultViewKey"));
    }
  }

  private category(): Category {
    return this.state<string>("/category") === "nonB2b" ? "nonB2b" : "b2b";
  }

  /** The saved views of the category on screen. */
  private store(): SavedViewStore<unknown> {
    return (this.category() === "nonB2b" ? this.nbViews : this.views) as SavedViewStore<unknown>;
  }

  /** The search state of the category on screen, as a saved view or shared link carries it. */
  private currentViewState(): unknown {
    return this.category() === "nonB2b"
      ? this.nb.viewState()
      : ReportServerFormatter.toViewState(this.filters(), this.state<boolean>("/advanced"));
  }

  public onSearch(): void {
    void this.reload();
  }

  public onClear(): void {
    this.model().setProperty("/filters", emptyFilters());
    this.model().setProperty("/advancedCount", 0);
    this.model().setProperty("/viewModified", true);
    void this.reload();
  }

  /** A new time window searches straight away. */
  public onTimePresetChange(): void {
    if (this.filters().timePreset !== "custom") {
      void this.reload();
    }
  }

  /** A status tile filters the list to that status ("all" clears it). */
  public onTilePress(event: Event): void {
    const tile = event.getSource() as unknown as GenericTile;
    this.model().setProperty("/filters/status", String(tile.data("status") ?? ""));
    this.model().setProperty("/viewModified", true);
    void this.reload();
  }

  public onLoadMore(): void {
    void this.loadPage(this.state<number>("/page") + 1, true);
  }

  /** Reloads page 1 and the status tiles together. */
  private async reload(): Promise<Interchange[]> {
    const [items] = await Promise.all([this.loadPage(1, false), this.loadSummary()]);
    return items;
  }

  private async loadPage(page: number, append: boolean): Promise<Interchange[]> {
    this.listAbort?.abort();
    const abort = new AbortController();
    this.listAbort = abort;
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const response = await this.service.list(
        ReportServerFormatter.toQuery(this.filters(), page, this.state<number>("/pageSize")),
        abort.signal,
      );
      const items = append
        ? [...this.state<Interchange[]>("/items"), ...response.items]
        : [...response.items];
      model.setProperty("/items", items);
      model.setProperty("/total", response.total);
      model.setProperty("/page", response.page);
      model.setProperty("/hasMore", items.length < response.total);
      model.setProperty(
        "/showingText",
        this.getText("list.showing", [items.length, response.total]),
      );
      model.setProperty("/unavailableMessage", "");
      return items;
    } catch (error) {
      if (!abort.signal.aborted) {
        this.handleLoadError(error);
      }
      return [];
    } finally {
      if (this.listAbort === abort) {
        model.setProperty("/busy", false);
      }
    }
  }

  private async loadSummary(): Promise<void> {
    try {
      const summary = await this.service.summary(ReportServerFormatter.toQuery(this.filters()));
      this.model().setProperty("/tiles", ReportServerFormatter.tiles(summary));
      this.model().setProperty("/summaryTruncated", summary.truncated);
    } catch {
      // The list request reports the error; the tiles simply stay empty.
      this.model().setProperty("/tiles", []);
    }
  }

  private handleLoadError(error: unknown): void {
    if (error instanceof AppError && error.code === B2B_UNAVAILABLE) {
      this.model().setProperty("/unavailableMessage", this.getText("unavailable"));
      this.model().setProperty("/items", []);
      this.model().setProperty("/total", 0);
      return;
    }
    this.getErrorHandler().handle(error);
  }

  /**
   * Finds the interchange a processing log belongs to (the hand-off from Message Monitoring and
   * Payload Studio) and opens it when there is exactly one.
   */
  private async openByProcessingLog(mplId: string): Promise<void> {
    this.applyState({
      filters: { ...emptyFilters(), timePreset: "all", mplId },
      advanced: true,
    });
    this.model().setProperty("/selectedViewKey", STANDARD_VIEW_KEY);
    this.model().setProperty("/viewModified", true);
    const items = await this.reload();
    if (items.length === 1 && items[0] !== undefined) {
      void this.openDetail(items[0].id);
    }
  }

  public onExport(): void {
    if (this.category() === "nonB2b") {
      this.nb.exportCsv();
      return;
    }
    const rows = this.state<Interchange[]>("/items").map((row) => ({
      status: row.overallStatus,
      startedAt: row.startedAt ?? "",
      sender: ReportServerFormatter.partner(row.sender),
      receiver: ReportServerFormatter.partner(row.receiver),
      document: ReportServerFormatter.document(row.sender),
      senderControlNumber: row.sender.interchangeControlNumber ?? "",
      receiverControlNumber: row.receiver.interchangeControlNumber ?? "",
      direction: row.direction ?? "",
      agreement: row.agreementTypeName ?? "",
      id: row.id,
    }));
    type Row = (typeof rows)[number];
    const columns = (Object.keys(rows[0] ?? {}) as (keyof Row)[]).map((property) => ({
      property,
      label: String(property),
    }));
    ExportHelper.exportCsv(rows, columns, "report-server");
  }

  // --- Views --------------------------------------------------------------------

  public onViewSelect(event: Event): void {
    this.selectView(String(event.getParameter("key" as never) ?? STANDARD_VIEW_KEY));
  }

  public onViewSave(event: Event): void {
    const name = String(event.getParameter("name" as never) ?? "").trim();
    if (name === "") {
      return;
    }
    const overwrite = event.getParameter("overwrite" as never) === true;
    const key = overwrite ? String(event.getParameter("key" as never) ?? "") : undefined;
    const store = this.store();
    const saved = store.save(
      name,
      this.currentViewState(),
      key === STANDARD_VIEW_KEY ? undefined : key,
    );
    if (event.getParameter("def" as never) === true) {
      store.setDefault(saved.key);
    }
    this.refreshViews();
    this.model().setProperty("/selectedViewKey", saved.key);
    this.model().setProperty("/viewModified", false);
    MessageToast.show(this.getText("toast.viewSaved", [saved.name]));
  }

  public onViewManage(event: Event): void {
    const renamed = (event.getParameter("renamed" as never) ?? []) as {
      key: string;
      name: string;
    }[];
    const deleted = (event.getParameter("deleted" as never) ?? []) as string[];
    const store = this.store();
    for (const entry of renamed) {
      store.rename(entry.key, entry.name);
    }
    for (const key of deleted) {
      store.remove(key);
    }
    const defaultKey = event.getParameter("def" as never) as string | undefined;
    if (defaultKey !== undefined) {
      store.setDefault(defaultKey);
    }
    this.refreshViews();
    if (deleted.includes(this.state<string>("/selectedViewKey"))) {
      this.selectView(STANDARD_VIEW_KEY);
    }
  }

  /** Copies a link that reopens this exact search (the time window stays relative). */
  public onShareView(): void {
    const token = DeepLinkHelper.encode(this.currentViewState() as never);
    const hash = this.getRouter().getURL("reportServer", {
      "?query": { category: this.category(), view: token },
    });
    const url = `${window.location.href.split("#")[0]}#/${hash}`;
    void ClipboardUtils.copyText(url).then((copied) => {
      MessageToast.show(this.getText(copied ? "toast.linkCopied" : "toast.linkFailed"));
    });
  }

  private selectView(key: string): void {
    if (this.category() === "nonB2b") {
      const view = key === STANDARD_VIEW_KEY ? undefined : this.nbViews.get(key);
      this.nb.apply(view?.state);
      this.model().setProperty("/selectedViewKey", view?.key ?? STANDARD_VIEW_KEY);
      this.model().setProperty("/viewModified", false);
      return;
    }
    const saved = key === STANDARD_VIEW_KEY ? undefined : this.views.get(key);
    this.applyState(
      saved === undefined
        ? { filters: emptyFilters(), advanced: false }
        : ReportServerFormatter.fromViewState(saved.state),
    );
    this.model().setProperty("/selectedViewKey", saved?.key ?? STANDARD_VIEW_KEY);
    this.model().setProperty("/viewModified", false);
    void this.reload();
  }

  private refreshViews(): void {
    const items: ViewItem[] = [
      {
        key: STANDARD_VIEW_KEY,
        title: this.getText("view.standard"),
        rename: false,
        remove: false,
      },
      ...this.store()
        .list()
        .map((view) => ({ key: view.key, title: view.name, rename: true, remove: true })),
    ];
    this.model().setProperty("/views", items);
    this.model().setProperty("/defaultViewKey", this.store().getDefaultKey());
  }

  private applyState(state: { filters: ReportServerFilters; advanced: boolean }): void {
    this.applying = true;
    try {
      this.model().setProperty("/filters", state.filters);
      this.model().setProperty("/advanced", state.advanced);
      this.model().setProperty(
        "/advancedCount",
        ReportServerFormatter.advancedCount(state.filters),
      );
    } finally {
      this.applying = false;
    }
  }

  // --- Detail -------------------------------------------------------------------

  public onSelect(event: Event): void {
    const item = event.getParameter("listItem" as never) as
      | { getBindingContext(name: string): { getObject(): unknown } | null | undefined }
      | undefined;
    const row = item?.getBindingContext("view")?.getObject() as Interchange | undefined;
    if (row !== undefined) {
      void this.openDetail(row.id);
    }
  }

  private async openDetail(interchangeId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/selectedId", interchangeId);
    model.setProperty("/detailBusy", true);
    try {
      void this.journey.show({ interchangeId });
      await this.b2b.load(interchangeId);
    } finally {
      model.setProperty("/detailBusy", false);
    }
  }

  // --- Helpers ------------------------------------------------------------------

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private state<T>(path: string): T {
    return this.model().getProperty(path) as T;
  }

  private filters(): ReportServerFilters {
    return this.state<ReportServerFilters>("/filters");
  }
}
