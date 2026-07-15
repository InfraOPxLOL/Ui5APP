/**
 * Shared, framework-free Region + Priority Queue Builder logic for the CoE creation flows — composes
 * the `Common_JMS_ID_{region}_{priority}` queue-name convention. Kept as a pure module so every flow
 * that creates a JMS queue (JMS Entry, JMS + Common Router) builds the name identically.
 */

/** A selectable region option for the queue builder's Region `Select`. */
export interface RegionOption {
  readonly key: string;
  readonly text: string;
}

/** Confirmed region list — `key` is the token substituted into the composed queue name. */
export const QUEUE_REGIONS: readonly RegionOption[] = [
  { key: "NA", text: "North America (NA)" },
  { key: "LA", text: "Latin America (LA)" },
  { key: "AS", text: "Asia (AS)" },
  { key: "EU", text: "Europe (EU)" },
  { key: "Hills", text: "Hills" },
];

/** Composes the shared JMS queue-name convention `Common_JMS_ID_{region}_{priority}`. */
export function buildQueueName(region: string, priority: string): string {
  return `Common_JMS_ID_${region}_${priority}`;
}
