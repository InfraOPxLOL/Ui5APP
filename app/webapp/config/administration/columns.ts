import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Administration list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const administrationTableConfig: TableDefinition = {
  columns: [
    {
      property: "destinationName",
      labelKey: "column.destinationName",
      type: "text",
      sortable: true,
    },
    { property: "tenantLabel", labelKey: "column.tenantLabel", type: "text" },
    { property: "status", labelKey: "column.status", type: "status", width: "8rem" },
    { property: "baseUrl", labelKey: "column.baseUrl", type: "text" },
  ],
  defaultSortProperty: "destinationName",
  defaultSortDescending: false,
  growingThreshold: 50,
};
