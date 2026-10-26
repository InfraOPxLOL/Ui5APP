import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type View from "sap/ui/core/mvc/View";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import DeepLinkHelper from "../../core/utils/DeepLinkHelper";
import { getModuleI18nModel } from "../../core/utils/ModuleI18n";
import { DateTimeFormatter } from "../../core/formatters";
import TransactionService from "../../service/reportServer/TransactionService";
import ReportServerFormatter from "../../formatter/reportServer/ReportServerFormatter";
import TransactionFormatter from "../../formatter/reportServer/TransactionFormatter";
import type {
  JmsStage,
  ParkedMessage,
  RouterStage,
  TransactionDetail,
  TransactionStatusCategory,
} from "../../service/reportServer/TransactionTypes";

/** State behind the shared transaction tabs, exposed to the host view as the `txn` model. */
export interface TransactionPanelState {
  detail: TransactionDetail | null;
  busy: boolean;
}

/** What the panel needs from the screen hosting it. */
export interface TransactionPanelHost {
  navigate(route: string, parameters?: Record<string, unknown>): void;
  handleError(error: unknown): void;
}

/**
 * Presenter for `fragment/transaction/TransactionTabs`: one non-B2B transaction — the business
 * message, the Common IDoc Router and JMS framework hops it passed through with how their
 * dead-letter queues connect, every step, and its errors. The Report Server and Failed Transactions
 * both host it, so a transaction reads the same wherever it is opened.
 *
 * The host exposes an instance as its `txn` property; handlers are arrow functions so they keep this
 * instance as `this` when UI5 calls them with the controller as context.
 */
export default class TransactionPanel {
  public readonly model = new JSONModel(TransactionPanel.initialState());

  /** Formatters the fragment binds to as `.txn.fmt.*`. */
  public readonly fmt = {
    dateTime: DateTimeFormatter.formatDateTime,
    statusState: (category?: TransactionStatusCategory): string =>
      ReportServerFormatter.statusState(category),
    statusIcon: (category?: TransactionStatusCategory): string =>
      ReportServerFormatter.statusIcon(category),
    jmsStageState: (stage?: JmsStage | null): string =>
      TransactionFormatter.jmsStageState(stage ?? undefined),
    // Bindings pass null, not undefined, for a missing property (a transaction without JMS/router).
    jmsStageText: (stage?: JmsStage | null): string =>
      stage ? this.text(`stage.jms.${stage}`) : "",
    routerStageState: (stage?: RouterStage | null): string =>
      stage === "failed" ? "Error" : stage === "routed" ? "Success" : "Warning",
    routerStageText: (stage?: RouterStage | null): string =>
      stage ? this.text(`stage.router.${stage}`) : "",
    queueSourceText: (source?: string): string =>
      this.text(
        source === "header" || source === "consumerFlow" ? `source.${source}` : "source.none",
      ),
    parkedText: (parked?: ParkedMessage | null): string =>
      !parked
        ? ""
        : !parked.retryTarget
          ? this.text("parked.textNoTarget", [
              parked.queueName,
              DateTimeFormatter.formatDateTime(parked.parkedAt),
            ])
          : this.text("parked.text", [
              parked.queueName,
              DateTimeFormatter.formatDateTime(parked.parkedAt),
              parked.retryTarget,
            ]),
  };

  private readonly service = new TransactionService();
  private readonly bundle = getModuleI18nModel("transaction").getResourceBundle() as ResourceBundle;
  private loadSequence = 0;

  public constructor(private readonly host: TransactionPanelHost) {}

  /** Attaches the `txn` model and `txnI18n` bundle the fragment binds to. */
  public attach(view: View): void {
    view.setModel(this.model, "txn");
    view.setModel(getModuleI18nModel("transaction"), "txnI18n");
  }

  /**
   * Loads and shows one transaction.
   * @param correlationId the correlation id shared by its processing logs.
   * @returns the transaction, or `undefined` when it could not be loaded (the error is shown).
   */
  public async load(correlationId: string): Promise<TransactionDetail | undefined> {
    const sequence = ++this.loadSequence;
    this.model.setProperty("/detail", null);
    this.model.setProperty("/busy", true);
    try {
      const detail = await this.service.getById(correlationId);
      if (sequence === this.loadSequence) {
        this.model.setProperty("/detail", detail);
      }
      return detail;
    } catch (error) {
      this.host.handleError(error);
      return undefined;
    } finally {
      if (sequence === this.loadSequence) {
        this.model.setProperty("/busy", false);
      }
    }
  }

  /** Empties the panel. */
  public clear(): void {
    this.loadSequence += 1;
    this.model.setProperty("/detail", null);
    this.model.setProperty("/busy", false);
  }

  /** Opens a processing log (a Link whose text is the MPL id) in the Message Monitoring drill-down. */
  public readonly onOpenProcessingLog = (event: Event): void => {
    const mplId = (event.getSource() as unknown as { getText(): string }).getText();
    if (mplId !== "") {
      this.host.navigate("messageMonitoring", { mplId });
    }
  };

  /** Opens the business flow's payload (else the latest step's) in Payload Studio. */
  public readonly onOpenPayload = (): void => {
    const detail = this.detail();
    const step =
      [...(detail?.steps ?? [])].reverse().find((candidate) => candidate.role === "business") ??
      detail?.steps.at(-1);
    if (step === undefined) {
      return;
    }
    this.host.navigate("payloadStudio", {
      "?query": { state: DeepLinkHelper.encode({ messageId: step.messageId }) },
    });
  };

  /** Opens Failed Transactions on the non-B2B dead-letter queues, filtered to this message. */
  public readonly onOpenFailedTransaction = (event: Event): void => {
    const source = event.getSource() as unknown as {
      getParent(): { getBindingContext(name: string): { getObject(): unknown } | null } | null;
    };
    const parked = source.getParent()?.getBindingContext("txn")?.getObject() as
      | ParkedMessage
      | undefined;
    if (parked === undefined) {
      return;
    }
    this.host.navigate("failedTransactions", {
      "?query": { category: "nonB2b", search: parked.jmsMessageId },
    });
  };

  private detail(): TransactionDetail | null {
    return this.model.getProperty("/detail") as TransactionDetail | null;
  }

  private text(key: string, args?: (string | number)[]): string {
    return this.bundle.getText(key, args) ?? key;
  }

  private static initialState(): TransactionPanelState {
    return { detail: null, busy: false };
  }
}
