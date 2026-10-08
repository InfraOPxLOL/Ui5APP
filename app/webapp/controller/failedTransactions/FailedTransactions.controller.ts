import BaseController from "../../core/base/BaseController";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import type Dialog from "sap/m/Dialog";
import type GenericTile from "sap/m/GenericTile";
import type Table from "sap/m/Table";
import MessageBox from "sap/m/MessageBox";
import { DateTimeFormatter } from "../../core/formatters";
import UserContext from "../../shell/context/UserContext";
import { RoleCollections } from "../../shell/permissions/RoleCollections";
import FailedTransactionsService from "../../service/failedTransactions/FailedTransactionsService";
import FailedTransactionsFormatter from "../../formatter/failedTransactions/FailedTransactionsFormatter";
import FailedTransactionsModel from "../../model/failedTransactions/FailedTransactionsModel";
import type {
  DeadLetterQueueCount,
  FailedTransaction,
  FailedTransactionDetail,
  FailedTransactionRetryResult,
} from "../../service/failedTransactions/FailedTransactionsTypes";

const RETRY_REASON = "Retried from Failed Transactions";

/** A row as the binding context hands it over. */
interface Bindable {
  getBindingContext(name: string): { getObject(): unknown } | null | undefined;
}

/**
 * Failed Transactions: messages parked on Trading Partner Management's dead-letter queues. Retry
 * moves a message back to the main queue its dead-letter queue maps to, verifies it arrived and
 * retries it there; the retry history counts every processing run of the same business message.
 *
 * @namespace com.middlewareops.integrationportal.controller.failedTransactions
 */
export default class FailedTransactionsController extends BaseController {
  public readonly formatter = FailedTransactionsFormatter;
  public readonly fmt = {
    dateTime: DateTimeFormatter.formatDateTime,
    outcome: (status?: string): string => this.getText(`outcome.${status ?? "failed"}`),
  };

  private readonly service = new FailedTransactionsService();
  private listAbort: AbortController | undefined;
  private loaded = false;
  private resultsDialog: Dialog | undefined;

  public onInit(): void {
    this.setModel(new FailedTransactionsModel(), "view");
    this.model().setProperty(
      "/canRetry",
      UserContext.getInstance()
        .getPermissionEngine()
        .isSatisfied({ anyRoleCollection: [RoleCollections.RetryOperator] }),
    );
    this.getRouter()
      .getRoute("failedTransactions")
      ?.attachPatternMatched(() => {
        if (!this.loaded) {
          this.loaded = true;
          void this.reload();
        }
      });
  }

  public onExit(): void {
    this.listAbort?.abort();
    this.resultsDialog?.destroy();
  }

  // --- List ------------------------------------------------------------------

  public onRefresh(): void {
    void this.reload();
  }

  public onSearch(): void {
    void this.reload();
  }

  /** A queue tile filters the list to that dead-letter queue (the "all" tile clears it). */
  public onTilePress(event: Event): void {
    const tile = event.getSource() as unknown as GenericTile;
    this.model().setProperty("/queueFilter", String(tile.data("queue") ?? ""));
    void this.reload();
  }

  public onLoadMore(): void {
    void this.loadPage(this.state<number>("/page") + 1, true);
  }

  public onSelectionChange(): void {
    this.model().setProperty("/selectedCount", this.table().getSelectedItems().length);
  }

  private async reload(): Promise<void> {
    await this.loadPage(1, false);
  }

  private async loadPage(page: number, append: boolean): Promise<void> {
    this.listAbort?.abort();
    const abort = new AbortController();
    this.listAbort = abort;
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const response = await this.service.list(
        {
          queue: this.state<string>("/queueFilter") || undefined,
          search: this.state<string>("/search").trim() || undefined,
          page,
          pageSize: this.state<number>("/pageSize"),
        },
        abort.signal,
      );
      const items = append
        ? [...this.state<FailedTransaction[]>("/items"), ...response.items]
        : [...response.items];
      if (!append) {
        this.table().removeSelections(true);
        model.setProperty("/selectedCount", 0);
      }
      model.setProperty("/items", items);
      model.setProperty("/total", response.total);
      model.setProperty("/page", response.page);
      model.setProperty("/hasMore", items.length < response.total);
      model.setProperty(
        "/showingText",
        this.getText("list.showing", [items.length, response.total]),
      );
      this.applyQueueCounts(response.queues);
    } catch (error) {
      if (!abort.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (this.listAbort === abort) {
        model.setProperty("/busy", false);
      }
    }
  }

  /** Tile counts only change when the full set is listed; a filtered list keeps the last counts. */
  private applyQueueCounts(queues: readonly DeadLetterQueueCount[]): void {
    const model = this.model();
    if (this.state<string>("/queueFilter") === "") {
      model.setProperty("/queues", [...queues]);
      model.setProperty(
        "/allCount",
        queues.reduce((sum, queue) => sum + queue.count, 0),
      );
    }
    const errors = queues
      .filter((queue) => queue.error !== undefined && queue.error !== "")
      .map((queue) => this.getText("queue.unreadable", [queue.queueName, queue.error ?? ""]));
    model.setProperty("/queueErrors", errors.join(" "));
  }

  // --- Detail ----------------------------------------------------------------

  public onItemPress(event: Event): void {
    const row = FailedTransactionsController.rowOf(event);
    if (row !== undefined) {
      void this.openDetail(row);
    }
  }

  private async openDetail(row: FailedTransaction): Promise<void> {
    const model = this.model();
    model.setProperty("/detailBusy", true);
    try {
      const detail = await this.service.getDetail(row.messageId, row.queueName);
      model.setProperty("/detail", detail);
      model.setProperty(
        "/pathText",
        FailedTransactionsFormatter.pathSummary(detail.recoveryPath, {
          move: this.getText("path.move"),
          verify: this.getText("path.verify"),
          retry: this.getText("path.retry"),
          manual: this.getText("path.manual"),
        }),
      );
    } catch (error) {
      model.setProperty("/detail", null);
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/detailBusy", false);
    }
  }

  public onOpenProcessingLog(event: Event): void {
    const mplId = (event.getSource() as unknown as { getText(): string }).getText();
    if (mplId !== "") {
      this.navTo("messageMonitoring", { mplId });
    }
  }

  public onOpenInterchange(): void {
    const id = this.state<FailedTransactionDetail | null>("/detail")?.interchange?.id;
    if (id !== undefined) {
      this.navTo("reportServer", { interchangeId: id });
    }
  }

  // --- Retry -----------------------------------------------------------------

  public onRetryRow(event: Event): void {
    const row = FailedTransactionsController.rowOf(event);
    if (row !== undefined) {
      this.confirmRetry([row]);
    }
  }

  public onRetryDetail(): void {
    const detail = this.state<FailedTransactionDetail | null>("/detail");
    if (detail !== null) {
      this.confirmRetry([detail.message]);
    }
  }

  public onRetrySelected(): void {
    const rows = this.table()
      .getSelectedItems()
      .map((item) => (item as unknown as Bindable).getBindingContext("view")?.getObject())
      .filter((row): row is FailedTransaction => row !== undefined);
    if (rows.length > 0) {
      this.confirmRetry(rows);
    }
  }

  private confirmRetry(rows: readonly FailedTransaction[]): void {
    const [first] = rows;
    if (first === undefined) {
      return;
    }
    const text =
      rows.length === 1
        ? this.getText("confirm.single", [
            first.messageId,
            first.queueName,
            first.targetQueue ?? this.getText("confirm.noTarget"),
          ])
        : this.getText("confirm.bulk", [rows.length]);
    MessageBox.confirm(text, {
      title: this.getText("confirm.title"),
      actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
      emphasizedAction: MessageBox.Action.OK,
      onClose: (action: string) => {
        if (action === MessageBox.Action.OK) {
          void this.runRetry(rows);
        }
      },
    });
  }

  private async runRetry(rows: readonly FailedTransaction[]): Promise<void> {
    const model = this.model();
    model.setProperty("/retrying", true);
    try {
      const results =
        rows.length === 1 && rows[0] !== undefined
          ? [await this.service.retry(rows[0].messageId, rows[0].queueName, RETRY_REASON)]
          : (
              await this.service.retryMany(
                rows.map((row) => ({ messageId: row.messageId, queueName: row.queueName })),
                RETRY_REASON,
              )
            ).results;
      await this.showResults(results);
      const openId = this.state<FailedTransactionDetail | null>("/detail")?.message.messageId;
      if (openId !== undefined && results.some((result) => result.messageId === openId)) {
        model.setProperty("/detail", null);
      }
      await this.reload();
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/retrying", false);
    }
  }

  private async showResults(results: readonly FailedTransactionRetryResult[]): Promise<void> {
    const tally = FailedTransactionsFormatter.tally(results);
    const model = this.model();
    model.setProperty("/results", [...results]);
    model.setProperty(
      "/resultsHeadline",
      this.getText("results.headline", [
        tally.accepted,
        tally.alreadyProcessed,
        tally.failed + tally.unavailable,
      ]),
    );
    this.resultsDialog ??= (await this.loadFragment({
      name: "com.middlewareops.integrationportal.fragment.failedTransactions.RetryResultsDialog",
    })) as Dialog;
    this.resultsDialog.open();
  }

  public onCloseResults(): void {
    this.resultsDialog?.close();
  }

  // --- Helpers ---------------------------------------------------------------

  private static rowOf(event: Event): FailedTransaction | undefined {
    return (event.getSource() as unknown as Bindable).getBindingContext("view")?.getObject() as
      | FailedTransaction
      | undefined;
  }

  private table(): Table {
    return this.byId("table") as Table;
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  private state<T>(path: string): T {
    return this.model().getProperty(path) as T;
  }
}
