import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Analytics list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const analyticsTableConfig: TableDefinition = {
  columns: [
    { property: "metric", labelKey: "column.metric", type: "text", sortable: true },
    { property: "value", labelKey: "column.value", type: "number", width: "10rem" },
    { property: "period", labelKey: "column.period", type: "text", width: "10rem" },
  ],
  defaultSortProperty: "metric",
  defaultSortDescending: false,
  growingThreshold: 50,
};
