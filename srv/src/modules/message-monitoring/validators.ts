import { z } from "zod";

/**
 * Request validation schemas for the Message Investigation Workspace (Phase 9). Applied at the route
 * boundary via `validateRequest` before any service runs. Field names are business-friendly (mirror
 * `OperationsQuery`), never `$`-prefixed OData options — the workspace speaks the Operations Engine's
 * vocabulary throughout.
 */

/** Recognized smart-filter presets (§ Smart Filters). Applied server-side as query shorthand. */
export const smartFilterSchema = z.enum([
  "failedToday",
  "currentlyProcessing",
  "longRunning",
  "retryCandidates",
  "businessErrors",
  "systemErrors",
  "recentlyFailed",
]);

/** Query schema for the investigation list endpoint. */
export const listQuerySchema = z.object({
  status: z.string().optional(),
  severity: z.enum(["info", "warning", "error", "critical"]).optional(),
  sender: z.string().optional(),
  receiver: z.string().optional(),
  messageType: z.string().optional(),
  customStatus: z.string().optional(),
  applicationId: z.string().optional(),
  integrationFlow: z.string().optional(),
  correlationId: z.string().optional(),
  queue: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  durationMinMs: z.coerce.number().int().min(0).optional(),
  durationMaxMs: z.coerce.number().int().min(0).optional(),
  smartFilter: smartFilterSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  // Accepted for forward-compatibility (§Environment Awareness); today every result is already
  // scoped to the single active tenant/environment, so these are documented no-ops.
  tenantId: z.string().optional(),
  environment: z.string().optional(),
});

/** Path-parameter schema shared by detail/related/context endpoints. */
export const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

/** Query schema for the bulk-export endpoint. */
export const exportQuerySchema = listQuerySchema.extend({
  format: z.enum(["csv", "json", "xml", "excel"]),
});

/** Body schema for the JMS retry endpoint (§ JMS Retry). */
export const jmsRetryBodySchema = z.object({
  queueName: z.string().min(1),
  reason: z.string().optional(),
});
