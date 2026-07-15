import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Alerts list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const alertNotificationTableConfig: TableDefinition = {
  columns: [
    { property: "alertId", labelKey: "column.alertId", type: "text", width: "12rem" },
    { property: "severity", labelKey: "column.severity", type: "severity", width: "8rem" },
    { property: "title", labelKey: "column.title", type: "text", sortable: true },
    { property: "source", labelKey: "column.source", type: "text" },
    {
      property: "raisedAt",
      labelKey: "column.raisedAt",
      type: "date",
      sortable: true,
      width: "12rem",
    },
  ],
  defaultSortProperty: "raisedAt",
  defaultSortDescending: true,
  growingThreshold: 50,
};
