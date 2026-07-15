/**
 * JMS queue states and severity thresholds used by the JMS Queue Management module.
 * Centralized so queue health rendering (badges, colours) is uniform.
 */
export const QueueStatus = {
  Ok: "OK",
  Blocked: "BLOCKED",
  NearCapacity: "NEAR_CAPACITY",
  Full: "FULL",
} as const;

/** Union of all queue status values. */
export type QueueStatusValue = (typeof QueueStatus)[keyof typeof QueueStatus];

/**
 * Fractional capacity thresholds (0..1) at which a queue transitions health state.
 * Consumed by formatters; not user-configurable in Phase 1.
 */
export const QueueCapacityThreshold = {
  NearCapacity: 0.8,
  Full: 1,
} as const;
