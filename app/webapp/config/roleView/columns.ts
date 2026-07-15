import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Roles list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const roleViewTableConfig: TableDefinition = {
  columns: [
    { property: "roleName", labelKey: "column.roleName", type: "text", sortable: true },
    { property: "description", labelKey: "column.description", type: "text" },
    { property: "scopeCount", labelKey: "column.scopeCount", type: "number", width: "9rem" },
  ],
  defaultSortProperty: "roleName",
  defaultSortDescending: false,
  growingThreshold: 50,
};
