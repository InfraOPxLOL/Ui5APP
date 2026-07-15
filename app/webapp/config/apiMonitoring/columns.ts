import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the API Monitoring list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const apiMonitoringTableConfig: TableDefinition = {
  columns: [
    { property: "apiName", labelKey: "column.apiName", type: "text", sortable: true },
    { property: "status", labelKey: "column.status", type: "status", width: "8rem" },
    { property: "callsToday", labelKey: "column.callsToday", type: "number", width: "10rem" },
    { property: "avgLatencyMs", labelKey: "column.avgLatency", type: "duration", width: "10rem" },
  ],
  defaultSortProperty: "apiName",
  defaultSortDescending: false,
  growingThreshold: 50,
};
