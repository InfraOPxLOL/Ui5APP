import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ConfigurableTable from "../../library/controls/ConfigurableTable";
import ExportHelper from "../../core/utils/ExportHelper";
import AlertNotificationService, {
  type AlertNotificationItem,
} from "../../service/alertNotification/AlertNotificationService";
import AlertNotificationFormatter from "../../formatter/alertNotification/AlertNotificationFormatter";
import AlertNotificationModel from "../../model/alertNotification/AlertNotificationModel";
import { alertNotificationTableConfig } from "../../config/alertNotification/columns";

/**
 * List controller for the Alerts module.
 *
 * Applies the declarative table configuration to the shared {@link ConfigurableTable}, binds it to
 * the module view model, and loads data through {@link AlertNotificationService}. It holds no business
 * logic — data shaping lives in the service, formatting in the formatter/core layer.
 *
 * @namespace com.middlewareops.integrationportal.controller.alertNotification
 */
export default class ListController extends BaseController {
  /** Exposed for optional formatter bindings in the view. */
  public readonly formatter = AlertNotificationFormatter;

  private readonly service = new AlertNotificationService();

  /**
   * Lifecycle hook: configures the table and triggers the initial load.
   */
  public onInit(): void {
    this.setModel(new AlertNotificationModel(), "view");
    const table = this.byId("table") as unknown as ConfigurableTable;
    table.applyConfiguration(alertNotificationTableConfig);
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
    const items = (this.getModel("view") as JSONModel).getProperty(
      "/items",
    ) as AlertNotificationItem[];
    const columns = alertNotificationTableConfig.columns.map((column) => ({
      property: column.property as keyof AlertNotificationItem,
      label: column.property,
    }));
    ExportHelper.exportCsv(items, columns, "alert-notification");
  }
}
