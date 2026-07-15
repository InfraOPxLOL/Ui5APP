import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the Message Replay list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const messageReplayTableConfig: TableDefinition = {
  columns: [
    {
      property: "messageId",
      labelKey: "column.messageId",
      type: "text",
      sortable: true,
      width: "13rem",
    },
    { property: "integrationFlow", labelKey: "column.integrationFlow", type: "text" },
    { property: "status", labelKey: "column.status", type: "status", width: "8rem" },
    {
      property: "failedAt",
      labelKey: "column.failedAt",
      type: "date",
      sortable: true,
      width: "12rem",
    },
    { property: "retryCount", labelKey: "column.retryCount", type: "number", width: "8rem" },
  ],
  defaultSortProperty: "failedAt",
  defaultSortDescending: true,
  growingThreshold: 50,
};
