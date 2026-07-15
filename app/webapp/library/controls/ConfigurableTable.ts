import Table from "sap/m/Table";
import Column from "sap/m/Column";
import ColumnListItem from "sap/m/ColumnListItem";
import Text from "sap/m/Text";
import Label from "sap/m/Label";
import Control from "sap/ui/core/Control";
import { TextAlign } from "sap/ui/core/library";
import StatusIndicator from "./StatusIndicator";
import SeverityBadge from "./SeverityBadge";
import TableConfigService from "../../core/services/table/TableConfigService";
import type { ColumnDefinition, TableDefinition } from "../../core/types/Table";

/**
 * Configuration-driven table control.
 *
 * Given a declarative {@link TableDefinition}, it generates the column headers and the row cell
 * template programmatically, so modules describe tables as data (`config/columns.ts`) instead of
 * hand-writing `<Column>`/cell XML. Adding or reordering a column becomes a one-line config change.
 * This is the single implementation of the reusable-table strategy (architecture §4, §8).
 *
 * Cell rendering is derived from each column's {@link ColumnDefinition.type}: `status`/`severity`
 * use the shared indicator controls; everything else uses a {@link sap.m.Text} with the formatter
 * resolved by {@link TableConfigService}.
 *
 * @namespace com.middlewareops.integrationportal.library.controls
 */
export default class ConfigurableTable extends Table {
  // Reuses the parent's renderer verbatim since this control adds no custom rendering — without
  // this, UI5 tries to auto-load a nonexistent "ConfigurableTableRenderer" module.
  public static readonly renderer = "sap.m.TableRenderer";

  private readonly tableConfig = TableConfigService.getInstance();
  private definition: TableDefinition | undefined;

  /**
   * Applies a table definition, (re)generating all columns.
   * @param definition the declarative table definition.
   * @returns this control, for chaining.
   */
  public applyConfiguration(definition: TableDefinition): this {
    this.definition = definition;
    this.removeAllColumns();
    definition.columns
      .filter((column) => column.visible !== false)
      .forEach((column) => this.addColumn(ConfigurableTable.createColumn(column)));
    if (definition.growingThreshold !== undefined) {
      this.setGrowing(true);
      this.setGrowingThreshold(definition.growingThreshold);
    }
    return this;
  }

  /**
   * Binds the table rows to a model path using a cell template generated from the applied
   * configuration.
   * @param path the aggregation binding path (e.g. `/items`).
   * @param modelName optional model name.
   * @returns this control, for chaining.
   * @throws {Error} if called before {@link ConfigurableTable.applyConfiguration}.
   */
  public bindRows(path: string, modelName?: string): this {
    if (this.definition === undefined) {
      throw new Error("applyConfiguration() must be called before bindRows().");
    }
    const fullPath = modelName !== undefined ? `${modelName}>${path}` : path;
    this.bindItems({
      path: fullPath,
      template: this.createRowTemplate(this.definition, modelName),
    });
    return this;
  }

  private static createColumn(column: ColumnDefinition): Column {
    return new Column({
      width: column.width,
      hAlign: (column.align ?? "Begin") as unknown as TextAlign,
      header: new Label({ text: `{i18n>${column.labelKey}}` }),
    });
  }

  private createRowTemplate(
    definition: TableDefinition,
    modelName: string | undefined,
  ): ColumnListItem {
    const cells: Control[] = definition.columns
      .filter((column) => column.visible !== false)
      .map((column) => this.createCell(column, modelName));
    return new ColumnListItem({ cells });
  }

  /**
   * Builds one cell control, bound against `modelName` — the same named model the row aggregation
   * is bound to (see {@link bindRows}). Every binding must carry an explicit `model` key: a bare
   * `{property}` string/path binding resolves against the *default* (unnamed) model, which this
   * app never registers (every view's data model is named, e.g. `"view"`), so an unprefixed
   * binding silently renders blank instead of erroring.
   */
  private createCell(column: ColumnDefinition, modelName: string | undefined): Control {
    switch (column.type) {
      case "status": {
        const indicator = new StatusIndicator();
        indicator.setDomain(column.statusDomain ?? "message");
        indicator.bindProperty("statusValue", { path: column.property, model: modelName });
        return indicator;
      }
      case "severity": {
        const badge = new SeverityBadge();
        badge.bindProperty("severity", { path: column.property, model: modelName });
        return badge;
      }
      default: {
        const formatter = this.tableConfig.getCellFormatter(column.type);
        return new Text({
          text:
            formatter !== undefined
              ? { path: column.property, model: modelName, formatter }
              : { path: column.property, model: modelName },
        });
      }
    }
  }
}
