import Table from "sap/ui/table/Table";
import Column from "sap/ui/table/Column";
import { SelectionMode, VisibleRowCountMode } from "sap/ui/table/library";
import Text from "sap/m/Text";
import Label from "sap/m/Label";
import { HorizontalAlign } from "sap/ui/core/library";
import StatusIndicator from "./StatusIndicator";
import SeverityBadge from "./SeverityBadge";
import TableConfigService from "../../core/services/table/TableConfigService";
import type Control from "sap/ui/core/Control";
import type {
  InvestigationColumnDefinition,
  InvestigationLayoutSnapshot,
  InvestigationTableDefinition,
} from "../../core/types/InvestigationTable";

/** Row height presets for the two supported density modes (pixels). */
const DENSITY_ROW_HEIGHT = { compact: 32, cozy: 44 } as const;

/**
 * The high-density operational data grid backing the Message Investigation Workspace (§ Message
 * Table) and any future investigation-style workspace.
 *
 * Built on `sap.ui.table.Table` (a project dependency since Phase 1) rather than `sap.m.Table` —
 * `sap.ui.table.Table` natively virtualizes rows (so large result sets render smoothly), supports
 * column pinning (`fixedColumnCount`), reordering (`enableColumnReordering`) and native single-column
 * grouping (`enableGrouping`/`groupBy`), none of which `sap.m.Table`/the existing
 * {@link module:./ConfigurableTable} provide. Given a declarative
 * {@link InvestigationTableDefinition}, it generates columns exactly as `ConfigurableTable` does for
 * its own domain — modules describe investigation tables as data, never hand-written column XML.
 *
 * Column resize and keyboard navigation are native `sap.ui.table.Table` behaviour and need no code
 * here. A row context menu is wired via the native `contextMenu` aggregation by the consuming
 * controller (`table.setContextMenu(menu)`) — kept out of this control so it stays reusable across
 * domains with different action sets. Double-click navigation is exposed as the custom
 * `rowDoubleClick` event (native `sap.ui.table.Table` has no such event).
 *
 * @namespace com.middlewareops.integrationportal.library.controls
 */
export default class InvestigationGrid extends Table {
  // Reuses the parent's renderer verbatim since this control adds no custom rendering.
  public static readonly renderer = "sap.ui.table.TableRenderer";

  private readonly tableConfig = TableConfigService.getInstance();
  private readonly columnsByProperty = new Map<string, Column>();
  private density: "compact" | "cozy" = "compact";
  private dblClickHandler: ((event: { target: EventTarget | null }) => void) | undefined;

  public constructor(idOrSettings?: string | object, settings?: object) {
    super(idOrSettings as string, settings);
    this.setSelectionMode(SelectionMode.MultiToggle);
    this.setEnableColumnReordering(true);
    this.setVisibleRowCountMode(VisibleRowCountMode.Auto);
    this.setThreshold(50);
  }

  /**
   * Applies a table definition, (re)generating all columns in declaration order.
   * @param definition the declarative table definition.
   * @param translate resolves a column's i18n label key to display text (XML views resolve labels
   *   via `{i18n>...}` bindings instead; this control is also constructible programmatically, so it
   *   accepts a resolver rather than assuming a specific i18n model name).
   * @param modelName the named model each cell's property binding resolves against — must match
   *   whatever model name is passed to the later {@link bindRowsTo} call (this app never registers
   *   a default/unnamed model, so an unprefixed cell binding would silently render blank).
   * @returns this control, for chaining.
   */
  public applyConfiguration(
    definition: InvestigationTableDefinition,
    translate: (key: string) => string,
    modelName?: string,
  ): this {
    this.removeAllColumns();
    this.columnsByProperty.clear();
    let fixedCount = 0;
    definition.columns.forEach((columnDef, index) => {
      const column = this.createColumn(columnDef, translate, modelName);
      this.addColumn(column);
      this.columnsByProperty.set(columnDef.property, column);
      if (columnDef.pinnable === true && fixedCount === index) {
        fixedCount += 1;
      }
    });
    this.setFixedColumnCount(fixedCount);
    return this;
  }

  /**
   * Binds the grid's `rows` aggregation to a model path. Named distinctly from the inherited generic
   * `bindRows(bindingInfo)` (which takes a raw {@link sap.ui.base.ManagedObject.AggregationBindingInfo})
   * so both remain available without an incompatible override.
   * @param path the aggregation binding path (e.g. `/items`).
   * @param modelName optional model name.
   * @returns this control, for chaining.
   */
  public bindRowsTo(path: string, modelName?: string): this {
    const fullPath = modelName !== undefined ? `${modelName}>${path}` : path;
    this.bindRows({ path: fullPath });
    return this;
  }

  /**
   * Shows or hides a column by its bound property.
   * @param property the column's bound property.
   * @param visible the new visibility.
   */
  public setColumnVisible(property: string, visible: boolean): void {
    this.columnsByProperty.get(property)?.setVisible(visible);
  }

  /**
   * @param property the column's bound property.
   * @returns whether the column is currently visible, or `undefined` when unknown.
   */
  public isColumnVisible(property: string): boolean | undefined {
    return this.columnsByProperty.get(property)?.getVisible();
  }

  /**
   * Sets (or clears) the single-column grouping target (§ Message Table — "Grouping"). Native
   * `sap.ui.table.Table` grouping requires a client-side (JSON) model and a `sortProperty` on the
   * grouped column, and disables independent column sort/filter while active — both already true of
   * this grid's usage.
   * @param property the column's bound property to group by, or `undefined` to disable grouping.
   */
  public setGroupByProperty(property: string | undefined): void {
    if (property === undefined) {
      this.setEnableGrouping(false);
      return;
    }
    const column = this.columnsByProperty.get(property);
    if (column !== undefined) {
      this.setEnableGrouping(true);
      this.setGroupBy(column);
    }
  }

  /**
   * Switches between the two supported density presets (§ Density Modes). Distinct from the shell's
   * cozy/compact content-density class (which affects control chrome generally) — this additionally
   * sets the grid's own row height so density changes are immediately visible in a data-dense grid.
   * @param density the density to apply.
   */
  public setDensity(density: "compact" | "cozy"): void {
    this.density = density;
    this.setRowHeight(DENSITY_ROW_HEIGHT[density]);
  }

  /** @returns the currently applied density. */
  public getDensity(): "compact" | "cozy" {
    return this.density;
  }

  /**
   * Captures the current column order, visibility, widths, pinned count, grouping and density as a
   * layout snapshot (§ Saved Layouts).
   * @returns the layout snapshot.
   */
  public getLayoutSnapshot(): InvestigationLayoutSnapshot {
    const columns = this.getColumns();
    return {
      columnOrder: columns.map((column) => InvestigationGrid.propertyOf(column)),
      hiddenProperties: columns
        .filter((column) => !column.getVisible())
        .map((column) => InvestigationGrid.propertyOf(column)),
      columnWidths: Object.fromEntries(
        columns.map((column) => [InvestigationGrid.propertyOf(column), column.getWidth()]),
      ),
      fixedColumnCount: this.getFixedColumnCount(),
      groupByProperty: this.getEnableGrouping() ? this.groupByPropertyName() : undefined,
      density: this.density,
    };
  }

  /**
   * Restores a previously captured layout snapshot (§ Saved Layouts). Column reordering is applied by
   * re-inserting columns in the snapshot's order; unknown properties are ignored (defensive against a
   * layout saved against a different column set).
   * @param snapshot the layout to restore.
   */
  public applyLayoutSnapshot(snapshot: InvestigationLayoutSnapshot): void {
    for (const property of snapshot.columnOrder) {
      const column = this.columnsByProperty.get(property);
      if (column !== undefined) {
        this.removeColumn(column);
        this.addColumn(column);
      }
    }
    for (const [property, column] of this.columnsByProperty) {
      column.setVisible(!snapshot.hiddenProperties.includes(property));
      const width = snapshot.columnWidths[property];
      if (width !== undefined && width !== "") {
        column.setWidth(width);
      }
    }
    this.setFixedColumnCount(snapshot.fixedColumnCount);
    this.setDensity(snapshot.density);
    this.setGroupByProperty(snapshot.groupByProperty);
  }

  /**
   * Registers a double-click handler for row navigation (§ Message Table — "Double click
   * navigation"). `sap.ui.table.Table` has no native double-click event, so this attaches a browser
   * event to the rendered table and resolves the clicked row's binding context.
   * @param handler invoked with the double-clicked row's binding context object, or `undefined` when
   *   the double-click did not land on a data row (e.g. the header).
   */
  public onRowDoubleClick(handler: (context: object | undefined) => void): void {
    this.dblClickHandler = (event: { target: EventTarget | null }) => {
      const targetElement = event.target as HTMLElement | null;
      const rowElement = targetElement?.closest("[data-sap-ui-rowindex]") ?? null;
      const rowIndex =
        rowElement === null ? undefined : Number(rowElement.getAttribute("data-sap-ui-rowindex"));
      const row = rowIndex === undefined ? undefined : this.getRows()[rowIndex];
      const context = row?.getBindingContext()?.getObject() as object | undefined;
      handler(context);
    };
    this.attachBrowserEvent("dblclick", this.dblClickHandler, this);
  }

  /** Lifecycle hook override: releases the browser event listener. */
  public exit(): void {
    if (this.dblClickHandler !== undefined) {
      this.detachBrowserEvent("dblclick", this.dblClickHandler, this);
    }
    super.exit();
  }

  private createColumn(
    columnDef: InvestigationColumnDefinition,
    translate: (key: string) => string,
    modelName: string | undefined,
  ): Column {
    const column = new Column({
      width: columnDef.width,
      hAlign: (columnDef.align ?? "Begin") as unknown as HorizontalAlign,
      label: new Label({ text: translate(columnDef.labelKey) }),
      template: this.createCell(columnDef, modelName),
      visible: columnDef.visible !== false,
      resizable: true,
    });
    if (columnDef.sortable === true) {
      column.setSortProperty(columnDef.property);
    }
    if (columnDef.filterable === true) {
      column.setFilterProperty(columnDef.property);
    }
    column.data("property", columnDef.property);
    return column;
  }

  /**
   * Builds one cell control, bound against `modelName` — the same named model the row aggregation
   * is bound to (see {@link bindRowsTo}). Every binding must carry an explicit `model` key: a bare
   * `{property}` string/path binding resolves against the *default* (unnamed) model, which this
   * app never registers (every view's data model is named, e.g. `"view"`), so an unprefixed
   * binding silently renders blank instead of erroring.
   */
  private createCell(
    columnDef: InvestigationColumnDefinition,
    modelName: string | undefined,
  ): Control {
    switch (columnDef.type) {
      case "status": {
        const indicator = new StatusIndicator();
        indicator.setDomain(columnDef.statusDomain ?? "message");
        indicator.bindProperty("statusValue", { path: columnDef.property, model: modelName });
        return indicator;
      }
      case "severity": {
        const badge = new SeverityBadge();
        badge.bindProperty("severity", { path: columnDef.property, model: modelName });
        return badge;
      }
      default: {
        const formatter = this.tableConfig.getCellFormatter(columnDef.type);
        return new Text({
          text:
            formatter !== undefined
              ? { path: columnDef.property, model: modelName, formatter }
              : { path: columnDef.property, model: modelName },
          wrapping: false,
        });
      }
    }
  }

  private groupByPropertyName(): string | undefined {
    const groupById = this.getGroupBy();
    for (const [property, column] of this.columnsByProperty) {
      if (column.getId() === groupById) {
        return property;
      }
    }
    return undefined;
  }

  private static propertyOf(column: Column): string {
    return (column.data("property") as string | undefined) ?? "";
  }
}
