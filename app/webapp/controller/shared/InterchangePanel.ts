import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type View from "sap/ui/core/mvc/View";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import MessageToast from "sap/m/MessageToast";
import ClipboardUtils from "../../core/utils/ClipboardUtils";
import DownloadUtils from "../../core/utils/DownloadUtils";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import { getModuleI18nModel } from "../../core/utils/ModuleI18n";
import { DateTimeFormatter, SizeFormatter } from "../../core/formatters";
import ReportServerService from "../../service/reportServer/ReportServerService";
import ReportServerFormatter from "../../formatter/reportServer/ReportServerFormatter";
import type {
  InterchangeDetail,
  InterchangePayload,
} from "../../service/reportServer/ReportServerTypes";

/** The document currently open in the viewer. */
export interface OpenDocument {
  id: string;
  direction: string;
  /** Toolbar text, e.g. "EDI · 1.2 KB". */
  label: string;
  text: string;
  editorType: string;
  format: string;
  isBinary: boolean;
}

/** State behind the shared interchange tabs, exposed to the host view as the `b2b` model. */
export interface InterchangePanelState {
  detail: InterchangeDetail | null;
  payload: OpenDocument | null;
  payloadBusy: boolean;
}

/** What the panel needs from the screen hosting it. */
export interface InterchangePanelHost {
  /** Navigates to another module's route. */
  navigate(route: string, parameters?: Record<string, unknown>): void;
  /** Shows an error the shared way. */
  handleError(error: unknown): void;
}

/**
 * Presenter for `fragment/b2b/InterchangeTabs`: one B2B interchange's sender and receiver, stored
 * documents (with viewer, copy, download and Payload Studio hand-off), processing events, errors
 * and linked processing logs. The Report Server and Failed Transactions both host it, so an
 * interchange looks and behaves the same wherever it is opened.
 *
 * The host exposes an instance as its `b2b` property; the fragment's handlers are arrow functions
 * so they keep this instance as `this` when UI5 calls them with the controller as context.
 */
export default class InterchangePanel {
  public readonly model = new JSONModel(InterchangePanel.initialState());

  /** Formatters the fragment binds to as `.b2b.fmt.*`. */
  public readonly fmt = {
    dateTime: DateTimeFormatter.formatDateTime,
    join: (values?: readonly string[]): string => (values ?? []).join(", "),
  };

  private readonly service = new ReportServerService();
  private readonly bundle = getModuleI18nModel("b2b").getResourceBundle() as ResourceBundle;
  /** Base64 content of an open binary document (kept out of the model; it is never displayed). */
  private binaryContent: string | undefined;
  private loadSequence = 0;

  public constructor(private readonly host: InterchangePanelHost) {}

  /** Attaches the `b2b` model and `b2bI18n` bundle the fragment binds to. */
  public attach(view: View): void {
    view.setModel(this.model, "b2b");
    view.setModel(getModuleI18nModel("b2b"), "b2bI18n");
  }

  /**
   * Loads and shows one interchange.
   * @param interchangeId the interchange (`BusinessDocument`) id.
   * @returns the detail, or `undefined` when it could not be loaded (the error is already shown).
   */
  public async load(interchangeId: string): Promise<InterchangeDetail | undefined> {
    const sequence = ++this.loadSequence;
    this.clear();
    try {
      const detail = await this.service.getById(interchangeId);
      if (sequence === this.loadSequence) {
        this.model.setProperty("/detail", detail);
      }
      return detail;
    } catch (error) {
      this.host.handleError(error);
      return undefined;
    }
  }

  /** Empties the panel (no interchange shown). */
  public clear(): void {
    this.model.setProperty("/detail", null);
    this.model.setProperty("/payload", null);
    this.binaryContent = undefined;
  }

  public readonly onPayloadSelect = (event: Event): void => {
    const item = event.getParameter("listItem" as never) as
      | { getBindingContext(name: string): { getObject(): unknown } | null | undefined }
      | undefined;
    const payload = item?.getBindingContext("b2b")?.getObject() as InterchangePayload | undefined;
    const detail = this.detail();
    if (payload !== undefined && detail !== null) {
      void this.openPayload(detail.interchange.id, payload);
    }
  };

  public readonly onCopyPayload = (): void => {
    const payload = this.payload();
    if (payload === null || payload.isBinary) {
      return;
    }
    void ClipboardUtils.copyText(payload.text).then((copied) => {
      MessageToast.show(this.text(copied ? "toast.copied" : "toast.copyFailed"));
    });
  };

  public readonly onDownloadPayload = (): void => {
    const payload = this.payload();
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
  };

  /**
   * Opens the interchange's documents in Payload Studio (search, tree view, compare received with
   * sent). Payload Studio is keyed by processing log, so the interchange's first linked log is used.
   */
  public readonly onOpenPayloadInStudio = (): void => {
    const detail = this.detail();
    const mplId = detail?.linkedProcessingLogs[0]?.mplId;
    if (detail === null || mplId === undefined) {
      MessageToast.show(this.text("toast.noProcessingLog"));
      return;
    }
    this.host.navigate("payloadStudio", {
      "?query": {
        state: DeepLinkHelper.encode({ messageId: mplId, interchangeId: detail.interchange.id }),
      },
    });
  };

  /** Opens a processing log (a Link whose text is the MPL id) in the Message Monitoring drill-down. */
  public readonly onOpenProcessingLog = (event: Event): void => {
    const mplId = (event.getSource() as unknown as { getText(): string }).getText();
    if (mplId !== "") {
      this.host.navigate("messageMonitoring", { mplId });
    }
  };

  private async openPayload(interchangeId: string, info: InterchangePayload): Promise<void> {
    this.model.setProperty("/payloadBusy", true);
    try {
      const payload = await this.service.getPayload(interchangeId, info.id);
      const open: OpenDocument = {
        id: payload.id,
        direction: payload.direction ?? "",
        label: `${payload.format.toUpperCase()} · ${SizeFormatter.formatBytes(payload.sizeBytes)}`,
        text: payload.encoding === "text" ? payload.content : "",
        editorType: ReportServerFormatter.editorType(payload.format),
        format: payload.format,
        isBinary: payload.encoding === "base64",
      };
      this.model.setProperty("/payload", open);
      this.binaryContent = payload.encoding === "base64" ? payload.content : undefined;
    } catch (error) {
      this.host.handleError(error);
    } finally {
      this.model.setProperty("/payloadBusy", false);
    }
  }

  private detail(): InterchangeDetail | null {
    return this.model.getProperty("/detail") as InterchangeDetail | null;
  }

  private payload(): OpenDocument | null {
    return this.model.getProperty("/payload") as OpenDocument | null;
  }

  private static initialState(): InterchangePanelState {
    return { detail: null, payload: null, payloadBusy: false };
  }

  private text(key: string): string {
    return this.bundle.getText(key) ?? key;
  }
}
