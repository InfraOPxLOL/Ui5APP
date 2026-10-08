import BaseController from "../../core/base/BaseController";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type GenericTile from "sap/m/GenericTile";
import MessageToast from "sap/m/MessageToast";
import ClipboardUtils from "../../core/utils/ClipboardUtils";
import DownloadUtils from "../../core/utils/DownloadUtils";
import ExportHelper from "../../core/utils/ExportHelper";
import { DateTimeFormatter, SizeFormatter } from "../../core/formatters";
import { AppError } from "../../core/errors/AppError";
import ReportServerService from "../../service/reportServer/ReportServerService";
import ReportServerFormatter from "../../formatter/reportServer/ReportServerFormatter";
import ReportServerModel, {
  emptyFilters,
  type OpenPayload,
} from "../../model/reportServer/ReportServerModel";
import type {
  Interchange,
  InterchangePayload,
  ReportServerFilters,
} from "../../service/reportServer/ReportServerTypes";

/** Backend error code for a tenant without Trading Partner Management. */
const B2B_UNAVAILABLE = "B2B_MONITORING_UNAVAILABLE";

interface RouteArguments {
  readonly interchangeId?: string;
}

/**
 * Report Server: every B2B interchange recorded by TPM's B2B Monitor, filterable, with sender and
 * receiver detail, payloads, processing events, errors and links to the processing logs.
 *
 * @namespace com.middlewareops.integrationportal.controller.reportServer
 */
export default class ReportServerController extends BaseController {
  public readonly formatter = ReportServerFormatter;
  public readonly fmt = {
    dateTime: DateTimeFormatter.formatDateTime,
    join: (values?: readonly string[]): string => (values ?? []).join(", "),
  };

  private readonly service = new ReportServerService();
  private listAbort: AbortController | undefined;
  private loaded = false;
  /** Base64 content of an open binary payload (kept out of the model; it is never displayed). */
  private binaryContent: string | undefined;

  public onInit(): void {
    this.setModel(new ReportServerModel(), "view");
    this.getRouter()
      .getRoute("reportServer")
      ?.attachPatternMatched((event: Event) => {
        const args = (event.getParameter("arguments" as never) ?? {}) as RouteArguments;
        if (!this.loaded) {
          this.loaded = true;
          void this.reload();
        }
        if (args.interchangeId !== undefined && args.interchangeId !== "") {
          void this.openDetail(args.interchangeId);
        }
      });
  }

  public onExit(): void {
    this.listAbort?.abort();
  }

  // --- List ------------------------------------------------------------------

  public onRefresh(): void {
    void this.reload();
  }

  public onSearch(): void {
    void this.reload();
  }

  public onClear(): void {
    this.model().setProperty("/filters", emptyFilters());
    void this.reload();
  }

  /** A status tile filters the list to that status ("all" clears it). */
  public onTilePress(event: Event): void {
    const tile = event.getSource() as unknown as GenericTile;
    const status = String(tile.data("status") ?? "");
    this.model().setProperty("/filters/status", status);
    void this.reload();
  }

  public onLoadMore(): void {
    void this.loadPage(this.state<number>("/page") + 1, true);
  }

  /** Reloads page 1 and the status tiles together. */
  private async reload(): Promise<void> {
    await Promise.all([this.loadPage(1, false), this.loadSummary()]);
  }

  private async loadPage(page: number, append: boolean): Promise<void> {
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
    } catch (error) {
      if (!abort.signal.aborted) {
        this.handleLoadError(error);
      }
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

  public onExport(): void {
    const rows = this.state<Interchange[]>("/items").map((row) => ({
      status: row.overallStatus,
      startedAt: row.startedAt ?? "",
      sender: ReportServerFormatter.partner(row.sender),
      receiver: ReportServerFormatter.partner(row.receiver),
      document: ReportServerFormatter.document(row.sender),
      senderControlNumber: row.sender.interchangeControlNumber ?? "",
      receiverControlNumber: row.receiver.interchangeControlNumber ?? "",
      direction: row.direction ?? "",
      id: row.id,
    }));
    type Row = (typeof rows)[number];
    const columns = (Object.keys(rows[0] ?? {}) as (keyof Row)[]).map((property) => ({
      property,
      label: String(property),
    }));
    ExportHelper.exportCsv(rows, columns, "report-server");
  }

  // --- Detail ----------------------------------------------------------------

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
    model.setProperty("/payload", null);
    model.setProperty("/detailBusy", true);
    try {
      model.setProperty("/detail", await this.service.getById(interchangeId));
    } catch (error) {
      model.setProperty("/detail", null);
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/detailBusy", false);
    }
  }

  public onPayloadSelect(event: Event): void {
    const item = event.getParameter("listItem" as never) as
      | { getBindingContext(name: string): { getObject(): unknown } | null | undefined }
      | undefined;
    const payload = item?.getBindingContext("view")?.getObject() as InterchangePayload | undefined;
    const interchangeId = this.state<string>("/selectedId");
    if (payload !== undefined && interchangeId !== "") {
      void this.openPayload(interchangeId, payload);
    }
  }

  private async openPayload(interchangeId: string, info: InterchangePayload): Promise<void> {
    const model = this.model();
    model.setProperty("/payloadBusy", true);
    try {
      const payload = await this.service.getPayload(interchangeId, info.id);
      const open: OpenPayload = {
        id: payload.id,
        direction: payload.direction ?? "",
        label: `${payload.format.toUpperCase()} · ${SizeFormatter.formatBytes(payload.sizeBytes)}`,
        text: payload.encoding === "text" ? payload.content : "",
        editorType: ReportServerFormatter.editorType(payload.format),
        format: payload.format,
        sizeBytes: payload.sizeBytes,
        isBinary: payload.encoding === "base64",
      };
      model.setProperty("/payload", open);
      this.binaryContent = payload.encoding === "base64" ? payload.content : undefined;
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/payloadBusy", false);
    }
  }

  public onCopyPayload(): void {
    const payload = this.state<OpenPayload | null>("/payload");
    if (payload === null || payload.isBinary) {
      return;
    }
    void ClipboardUtils.copyText(payload.text).then((copied) => {
      MessageToast.show(this.getText(copied ? "toast.copied" : "toast.copyFailed"));
    });
  }

  public onDownloadPayload(): void {
    const payload = this.state<OpenPayload | null>("/payload");
    if (payload === null) {
      return;
    }
    const fileName = `${payload.id}.${ReportServerFormatter.fileExtension(payload.format as never)}`;
    if (payload.isBinary && this.binaryContent !== undefined) {
      const bytes = Uint8Array.from(atob(this.binaryContent), (char) => char.charCodeAt(0));
      DownloadUtils.downloadBlob(new Blob([bytes]), fileName);
      return;
    }
    DownloadUtils.downloadText(payload.text, fileName);
  }

  /** Opens an MPL in the Message Monitoring drill-down. */
  public onOpenProcessingLog(event: Event): void {
    const source = event.getSource() as unknown as {
      getText(): string;
    };
    const mplId = source.getText();
    if (mplId !== "") {
      this.navTo("messageMonitoring", { mplId });
    }
  }

  // --- Helpers ---------------------------------------------------------------

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
