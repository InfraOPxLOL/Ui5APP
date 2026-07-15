import type { ColumnAlign, ColumnType } from "./Table";

/**
 * Declarative column/table types for the reusable
 * {@link module:com/middlewareops/integrationportal/library/controls/InvestigationGrid} — the
 * high-density operational data grid the Message Investigation Workspace (and future investigation
 * workspaces) build on. Deliberately separate from {@link module:./Table} (`ColumnDefinition`/
 * `TableDefinition`, which back the simpler {@link module:com/middlewareops/integrationportal/library/controls/ConfigurableTable}
 * used by plain list modules) rather than extending that frozen contract in place, since the
 * investigation grid needs materially richer per-column metadata (pinning, grouping, quick-search
 * inclusion) that a basic list column has no use for.
 */

/** Declarative definition of a single investigation-grid column. */
export interface InvestigationColumnDefinition {
  /** Bound source property on each row object. */
  readonly property: string;
  /** i18n key resolving to the column header text. */
  readonly labelKey: string;
  /** Cell rendering type (reuses the same vocabulary as {@link module:./Table.ColumnType}). */
  readonly type: ColumnType;
  /** For `status`/`severity` columns, which status domain to colour against (defaults to `message`). */
  readonly statusDomain?: "message" | "queue";
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly align?: ColumnAlign;
  readonly width?: string;
  /** Whether the column is visible by default (togglable at runtime via the Columns popover). */
  readonly visible?: boolean;
  /** Whether the column may be pinned into the frozen (left-fixed) region. */
  readonly pinnable?: boolean;
  /** Whether the column may be used as the grid's `groupBy` target. */
  readonly groupable?: boolean;
  /** Whether the column's raw value participates in the grid's client-side quick search. */
  readonly quickSearchable?: boolean;
}

/** Full investigation-grid configuration: columns plus behavioural defaults. */
export interface InvestigationTableDefinition {
  readonly columns: readonly InvestigationColumnDefinition[];
  readonly defaultSortProperty?: string;
  readonly defaultSortDescending?: boolean;
}

/** A saved column layout (order, visibility, widths, pinned count) — see `InvestigationGrid.getLayoutSnapshot`. */
export interface InvestigationLayoutSnapshot {
  readonly columnOrder: readonly string[];
  readonly hiddenProperties: readonly string[];
  readonly columnWidths: Readonly<Record<string, string>>;
  readonly fixedColumnCount: number;
  readonly groupByProperty: string | undefined;
  readonly density: "compact" | "cozy";
}
