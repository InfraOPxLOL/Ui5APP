import { z } from "zod";

/**
 * Schema for `config/monitoring.json` — cross-module monitoring defaults. These are presentation
 * and query defaults only; no Integration Suite connectivity is implied by this file.
 *
 * Properties:
 * - `defaultTimeWindowHours`    — initial look-back window applied by monitoring list filters.
 * - `defaultStatusFilter`       — initial message-status filter (matches the `MessageStatus`
 *                                 constants; free-form string so future statuses need no schema change).
 * - `maxPageSize`               — hard ceiling for `$top` accepted by list endpoints.
 * - `defaultPageSize`           — page size used when a client does not specify `$top`.
 * - `liveFeedChannels`          — logical WebSocket channel names per live concern; the frontend
 *                                 subscribes to these names, the backend broadcasts on them.
 * - `slowProcessingThresholdMs` — processing time above which a message is highlighted as slow.
 */
export const monitoringSchema = z.object({
  defaultTimeWindowHours: z.number().int().min(1).max(720),
  defaultStatusFilter: z.string().min(1),
  maxPageSize: z.number().int().min(1).max(1000),
  defaultPageSize: z.number().int().min(1),
  liveFeedChannels: z.record(z.string(), z.string().min(1)),
  slowProcessingThresholdMs: z.number().int().min(1),
});

/** Typed view of `config/monitoring.json`. */
export type MonitoringConfig = z.infer<typeof monitoringSchema>;
