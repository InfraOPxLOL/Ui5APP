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

/**
 * The processing frameworks a message can be filtered by (§1). Mirrors `ProcessingFramework` in
 * `operations/dto/FrameworkDto.ts`, including the two non-configurable detection outcomes.
 */
export const frameworkSchema = z.enum([
  "TPM_V2",
  "JMS_FRAMEWORK",
  "COMMON_IDOC_ROUTER",
  "IDOC_STATUS_SYNC",
  "NON_FRAMEWORK",
  "UNKNOWN",
]);

/** The recovery conditions a message can be filtered by (§7) — the axis independent of framework. */
export const recoveryStateSchema = z.enum([
  "RECOVERABLE",
  "RETRY_AVAILABLE",
  "DLQ_RECOVERY_AVAILABLE",
  "RETRYING",
  "NOT_FOUND",
  "MANUAL_INVESTIGATION_REQUIRED",
  "UNSUPPORTED",
  "COMPLETED",
  "FAILED_AGAIN",
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
  framework: frameworkSchema.optional(),
  recoveryState: recoveryStateSchema.optional(),
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

/**
 * Body schema for the bulk recovery-plan endpoint (§9). Bounded to the grid's own maximum page size
 * so one request cannot ask the backend to resolve an unbounded number of strategies.
 */
export const recoveryPlanBodySchema = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Body schema for the framework-aware recovery endpoint (§10).
 *
 * `queueName` is **optional and never a default**: it is supplied only when a strategy legitimately
 * could not resolve a queue itself (the JMS framework with an unparseable queue header) and the
 * operator picked one. Every other framework resolves its own queue from configuration.
 */
export const recoverBodySchema = z.object({
  reason: z.string().optional(),
  queueName: z.string().min(1).optional(),
});

/** Query schema for the single-message recovery-plan endpoint. */
export const recoveryPlanQuerySchema = z.object({
  queueName: z.string().min(1).optional(),
});
