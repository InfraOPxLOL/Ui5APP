import type { TableDefinition } from "../../core/types/Table";

/**
 * Declarative table definition for the JMS Queues list, consumed by the shared
 * {@link ConfigurableTable}. Adding or reordering a column is a change here only — no view edit.
 */
export const jmsQueueTableConfig: TableDefinition = {
  columns: [
    { property: "queueName", labelKey: "column.queueName", type: "text", sortable: true },
    {
      property: "state",
      labelKey: "column.state",
      type: "status",
      statusDomain: "queue",
      width: "8rem",
    },
    { property: "messageCount", labelKey: "column.messageCount", type: "number", width: "9rem" },
    { property: "consumerCount", labelKey: "column.consumerCount", type: "number", width: "9rem" },
    { property: "capacityUsedPct", labelKey: "column.capacityUsed", type: "number", width: "9rem" },
  ],
  defaultSortProperty: "queueName",
  defaultSortDescending: false,
  growingThreshold: 50,
};
