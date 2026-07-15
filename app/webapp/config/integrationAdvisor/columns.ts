import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Integration Advisor list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const integrationAdvisorTableConfig: TableDefinition = {
  columns: [
    { property: "name", labelKey: "column.name", type: "text", sortable: true },
    { property: "artifactType", labelKey: "column.artifactType", type: "text", width: "10rem" },
    { property: "status", labelKey: "column.status", type: "status", width: "8rem" },
    { property: "updatedAt", labelKey: "column.updatedAt", type: "date", width: "12rem" },
  ],
  defaultSortProperty: "updatedAt",
  defaultSortDescending: true,
  growingThreshold: 50,
};
