import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ConfigurableTable from "../../library/controls/ConfigurableTable";
import ExportHelper from "../../core/utils/ExportHelper";
import MessageReplayService, {
  type MessageReplayItem,
} from "../../service/messageReplay/MessageReplayService";
import MessageReplayFormatter from "../../formatter/messageReplay/MessageReplayFormatter";
import MessageReplayModel from "../../model/messageReplay/MessageReplayModel";
import { messageReplayTableConfig } from "../../config/messageReplay/columns";

/**
 * List controller for the Message Replay module.
 *
 * Applies the declarative table configuration to the shared {@link ConfigurableTable}, binds it to
 * the module view model, and loads data through {@link MessageReplayService}. It holds no business
 * logic — data shaping lives in the service, formatting in the formatter/core layer.
 *
 * @namespace com.middlewareops.integrationportal.controller.messageReplay
 */
export default class ListController extends BaseController {
  /** Exposed for optional formatter bindings in the view. */
  public readonly formatter = MessageReplayFormatter;

  private readonly service = new MessageReplayService();

  /**
   * Lifecycle hook: configures the table and triggers the initial load.
   */
  public onInit(): void {
    this.setModel(new MessageReplayModel(), "view");
    const table = this.byId("table") as unknown as ConfigurableTable;
    table.applyConfiguration(messageReplayTableConfig);
    table.bindRows("/items", "view");
    void this.refresh();
  }

  /**
   * Reloads the list from the backend, managing the busy state.
   */
  public async refresh(): Promise<void> {
    const model = this.getModel("view") as JSONModel;
    model.setProperty("/busy", true);
    try {
      const page = await this.service.list();
      model.setProperty("/items", page.items);
      model.setProperty("/total", page.total);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /**
   * Refresh action handler.
   */
  public onRefresh(): void {
    void this.refresh();
  }

  /**
   * Exports the currently loaded rows to CSV via the shared {@link ExportHelper}.
   */
  public onExport(): void {
    const items = (this.getModel("view") as JSONModel).getProperty("/items") as MessageReplayItem[];
    const columns = messageReplayTableConfig.columns.map((column) => ({
      property: column.property as keyof MessageReplayItem,
      label: column.property,
    }));
    ExportHelper.exportCsv(items, columns, "message-replay");
  }
}
