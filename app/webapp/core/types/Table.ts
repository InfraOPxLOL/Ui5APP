/**
 * Declarative column and table configuration types consumed by the shared
 * {@link module:com/middlewareops/integrationportal/library/controls/ConfigurableTable} control.
 *
 * Modules describe their tables as data (`config/columns.ts`) rather than hand-written XML, which
 * is the primary lever for eliminating table markup duplication (architecture §4).
 */

/** Rendering type of a column cell. Drives which control and formatter the table uses. */
export type ColumnType = "text" | "status" | "severity" | "date" | "duration" | "size" | "number";

/** Horizontal alignment of a column's cell content. */
export type ColumnAlign = "Begin" | "Center" | "End";

/** Declarative definition of a single table column. */
export interface ColumnDefinition {
  /** Bound source property on each row object. */
  readonly property: string;
  /** i18n key resolving to the column header text. */
  readonly labelKey: string;
  /** Cell rendering type. */
  readonly type: ColumnType;
  /** For `status` columns, which status domain to colour against (defaults to `message`). */
  readonly statusDomain?: "message" | "queue";
  /** Whether the column is sortable. */
  readonly sortable?: boolean;
  /** Whether the column is filterable. */
  readonly filterable?: boolean;
  /** Cell alignment. */
  readonly align?: ColumnAlign;
  /** Relative or absolute column width (e.g. `"8rem"`). */
  readonly width?: string;
  /** Whether the column is initially visible. */
  readonly visible?: boolean;
}

/** Full table configuration: columns plus behavioural defaults. */
export interface TableDefinition {
  readonly columns: readonly ColumnDefinition[];
  /** Property used as the default sort key. */
  readonly defaultSortProperty?: string;
  /** Whether the default sort is descending. */
  readonly defaultSortDescending?: boolean;
  /** Growing threshold (rows per page) for server-side paginated growth. */
  readonly growingThreshold?: number;
}
