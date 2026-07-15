import { z } from "zod";

/** SLA priority classes offered by the wizard (spec §5 Tab C). */
export const ROUTE_PRIORITIES = ["P1", "P2", "P3"] as const;

/** Partner/route identifiers: letters, digits, underscore and dot (PDs like `.SYS_JMS_FRAMEWORK`). */
const PID_PATTERN = /^[A-Za-z0-9_.]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Optional comma-separated email list (alerting recipients) — empty is allowed. */
const emailListSchema = z.string().refine(
  (value) =>
    value.trim() === "" ||
    value
      .split(",")
      .map((entry) => entry.trim())
      .every((entry) => EMAIL_PATTERN.test(entry)),
  "Must be a comma-separated list of valid email addresses.",
);

/** The six IDoc control-record identifiers the route key is built from (shared across deploy bodies). */
const idocSchema = z.object({
  sndprn: z.string().min(1),
  rcvprn: z.string().min(1),
  mestyp: z.string().min(1),
  idoctyp: z.string(),
  sndpor: z.string(),
  rcvpor: z.string(),
});

/** Body schema for `POST /api/v1/coe-router/check`. */
export const routeAgreementQuerySchema = z.object({
  sndprn: z.string().min(1),
  rcvprn: z.string().min(1),
  mestyp: z.string().min(1),
  targetPid: z.string().regex(PID_PATTERN),
});

/** Body schema for `POST /api/v1/coe-router/router/check`. */
export const routerAgreementQuerySchema = z.object({
  sndprn: z.string().min(1),
  rcvprn: z.string().min(1),
  mestyp: z.string().min(1),
  routerPid: z.string().regex(PID_PATTERN),
});

/** Body schema for `POST /api/v1/coe-router/router/deploy`. */
export const routerDeploySchema = z.object({
  idoc: idocSchema,
  routerPid: z.string().regex(PID_PATTERN),
  finalTargetPid: z.string().regex(PID_PATTERN),
  track: z.enum(["normal", "ruleset"]),
  rulesetKey: z.string().optional(),
});

/** Advanced tab schemas (spec §5), shared between the JMS-only and combined deploy bodies. */
const customMappingSchema = z.object({
  enabled: z.boolean(),
  condition: z.enum(["pre", "post"]),
  address: z.string().regex(/^\//, "Must begin with a forward slash."),
});
/** Framework-imposed ceiling — the retry counter does not advance past this value. */
const MAX_RETRIES_CEILING = 5;
const alertingSchema = z.object({
  to: emailListSchema,
  cc: emailListSchema,
  bcc: emailListSchema,
  subject: z.string(),
  maxRetries: z.number().int().min(0).max(MAX_RETRIES_CEILING),
});
const optimizationSchema = z.object({
  priority: z.enum(ROUTE_PRIORITIES),
  sync: z.boolean(),
  forceCacheRefresh: z.boolean(),
});

/** Body schema for `POST /api/v1/coe-router/deploy`. */
export const routeDeploySchema = z.object({
  idoc: idocSchema,
  targetPid: z.string().regex(PID_PATTERN),
  targetQueue: z.string().min(1),
  endpointUri: z.string().regex(/^\//, "Must begin with a forward slash."),
  track: z.enum(["normal", "ruleset"]),
  rulesetKey: z.string().optional(),
  customMapping: customMappingSchema.optional(),
  alerting: alertingSchema.optional(),
  optimization: optimizationSchema.optional(),
});

/** Body schema for `POST /api/v1/coe-router/combined/check`. */
export const combinedAgreementQuerySchema = z.object({
  sndprn: z.string().min(1),
  rcvprn: z.string().min(1),
  mestyp: z.string().min(1),
  targetPid: z.string().regex(PID_PATTERN),
  routerPid: z.string().regex(PID_PATTERN),
});

/** Query schema for `GET /api/v1/coe-router/agreement/lookup` (Parameter Registry's box 1/2). */
export const agreementLookupQuerySchema = z.object({
  type: z.enum(["jms", "router"]),
  sndprn: z.string().min(1),
  rcvprn: z.string().min(1),
  mestyp: z.string().optional(),
});

/** Query schema for `GET /api/v1/coe-router/present-in` (Parameter Registry's box 3 reverse lookup). */
export const presentInQuerySchema = z.object({
  targetPid: z.string().regex(PID_PATTERN),
});

/** Body schema for `POST /api/v1/coe-router/combined/deploy`. */
export const combinedDeploySchema = z.object({
  idoc: idocSchema,
  targetPid: z.string().regex(PID_PATTERN),
  targetQueue: z.string().min(1),
  endpointUri: z.string().regex(/^\//, "Must begin with a forward slash."),
  jmsTrack: z.enum(["normal", "ruleset"]),
  jmsRulesetKey: z.string().optional(),
  customMapping: customMappingSchema.optional(),
  alerting: alertingSchema.optional(),
  optimization: optimizationSchema.optional(),
  routerPid: z.string().regex(PID_PATTERN),
  routerTrack: z.enum(["normal", "ruleset"]),
  routerRulesetKey: z.string().optional(),
});
