import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import CoeDlqService from "../../service/coeDlq/CoeDlqService";
import CoeDlqFormatter from "../../formatter/coeDlq/CoeDlqFormatter";
import DlqModel from "../../model/coeDlq/DlqModel";
import type { DlqMessage } from "../../service/coeDlq/CoeDlqTypes";

/**
 * Controller for the DLQ & Intelligent Recovery Dashboard workspace (spec §6, Tile 4). A
 * master-detail over failed messages: selecting one loads its recovery context (the resolved target
 * JMS queue + error details), and Replay resolves the queue for an operator replay. Consumes **only**
 * `/api/v1/coe-dlq`.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeDlq
 */
export default class DlqController extends BaseController {
  private readonly service = new CoeDlqService();
  private abort: AbortController | undefined;

  /** Exposed for formatter bindings in the view. */
  public formatDateTime(value: string | undefined): string {
    return CoeDlqFormatter.dateTime(value);
  }

  /** Lifecycle hook: installs the view model and loads the failed-message list. */
  public onInit(): void {
    this.setModel(new DlqModel(), "view");
    void this.loadMessages();
  }

  /** Lifecycle hook: aborts any in-flight request. */
  public onExit(): void {
    this.abort?.abort();
  }

  /** Reloads the failed-message list. */
  public onRefresh(): void {
    void this.loadMessages();
  }

  private async loadMessages(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    try {
      const list = await this.service.listFailed(controller.signal);
      model.setProperty("/messages", [...list.items]);
      model.setProperty("/total", list.total);
      model.setProperty("/selected", null);
      model.setProperty("/replayResult", null);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  /** Loads the recovery context for the pressed message row. */
  public onSelectMessage(event: Event): void {
    const item = event.getParameter("listItem" as never) as unknown as {
      getBindingContext(model?: string): { getObject(): unknown } | null | undefined;
    };
    const row = item.getBindingContext("view")?.getObject() as DlqMessage | undefined;
    if (row !== undefined) {
      void this.loadRecovery(row.messageId);
    }
  }

  private async loadRecovery(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    model.setProperty("/replayResult", null);
    try {
      const recovery = await this.service.getRecovery(messageId);
      model.setProperty("/selected", recovery);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /** Attempts a replay of the selected message (resolves its target queue). */
  public onReplay(): void {
    const selected = this.model().getProperty("/selected") as { messageId: string } | null;
    if (selected !== null) {
      void this.replay(selected.messageId);
    }
  }

  private async replay(messageId: string): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const result = await this.service.replay(messageId);
      model.setProperty("/replayResult", result);
      MessageToast.show(this.getText("coeDlq.replay.done"));
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
