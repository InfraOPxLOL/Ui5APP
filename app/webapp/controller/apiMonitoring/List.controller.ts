import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ConfigurableTable from "../../library/controls/ConfigurableTable";
import ExportHelper from "../../core/utils/ExportHelper";
import ApiMonitoringService, {
  type ApiMonitoringItem,
} from "../../service/apiMonitoring/ApiMonitoringService";
import ApiMonitoringFormatter from "../../formatter/apiMonitoring/ApiMonitoringFormatter";
import ApiMonitoringModel from "../../model/apiMonitoring/ApiMonitoringModel";
import { apiMonitoringTableConfig } from "../../config/apiMonitoring/columns";

/**
 * List controller for the API Monitoring module.
 *
 * Applies the declarative table configuration to the shared {@link ConfigurableTable}, binds it to
 * the module view model, and loads data through {@link ApiMonitoringService}. It holds no business
 * logic — data shaping lives in the service, formatting in the formatter/core layer.
 *
 * @namespace com.middlewareops.integrationportal.controller.apiMonitoring
 */
export default class ListController extends BaseController {
  /** Exposed for optional formatter bindings in the view. */
  public readonly formatter = ApiMonitoringFormatter;

  private readonly service = new ApiMonitoringService();

  /**
   * Lifecycle hook: configures the table and triggers the initial load.
   */
  public onInit(): void {
    this.setModel(new ApiMonitoringModel(), "view");
    const table = this.byId("table") as unknown as ConfigurableTable;
    table.applyConfiguration(apiMonitoringTableConfig);
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
    const items = (this.getModel("view") as JSONModel).getProperty("/items") as ApiMonitoringItem[];
    const columns = apiMonitoringTableConfig.columns.map((column) => ({
      property: column.property as keyof ApiMonitoringItem,
      label: column.property,
    }));
    ExportHelper.exportCsv(items, columns, "api-monitoring");
  }
}
