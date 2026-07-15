import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Audit Trail list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const auditViewTableConfig: TableDefinition = {
  columns: [
    {
      property: "timestamp",
      labelKey: "column.timestamp",
      type: "date",
      sortable: true,
      width: "14rem",
    },
    { property: "actor", labelKey: "column.actor", type: "text", sortable: true },
    { property: "action", labelKey: "column.action", type: "text" },
    { property: "target", labelKey: "column.target", type: "text" },
    { property: "correlationId", labelKey: "column.correlationId", type: "text", width: "14rem" },
  ],
  defaultSortProperty: "timestamp",
  defaultSortDescending: true,
  growingThreshold: 50,
};
