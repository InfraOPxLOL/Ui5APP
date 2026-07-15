import { z } from "zod";

const PID_PATTERN = /^[A-Za-z0-9_.]+$/;

/** Query schema for `GET /api/v1/coe-rule-builder/list?pid=…`. */
export const ruleListQuerySchema = z.object({
  pid: z.string().regex(PID_PATTERN),
});

/** Query schema for `GET /api/v1/coe-rule-builder?pid=…&id=…` and the `DELETE` variant. */
export const ruleQuerySchema = z.object({
  pid: z.string().regex(PID_PATTERN),
  id: z.string().min(1),
});

const identifyingQuerySchema = z.object({
  type: z.enum(["property", "xpath"]),
  expression: z.string().min(1),
  expectedValue: z.string(),
});

const ruleSetRuleSchema = z.object({
  kind: z.literal("ruleset"),
  ruleName: z.string().min(1),
  identifyingQueries: z.array(identifyingQuerySchema).min(1),
  targetRouting: z.object({
    targetPid: z.string().regex(PID_PATTERN),
    routeKey: z.string().min(1),
  }),
});

const xCastConditionSchema = z.object({
  filterType: z.enum(["xpath_exists", "property"]),
  expression: z.string().min(1),
  expectedValue: z.string(),
});

const xCastOutputSchema = z.object({
  nodeType: z.literal("output"),
  routingType: z.enum(["JMS", "ProcessDirect", "Terminate"]),
  target: z.string(),
});

/** Recursive: a condition node's `then` and `next` may themselves be arbitrarily nested nodes. */
type XCastNodeInput = z.infer<typeof xCastOutputSchema> | XCastBranchNodeInput;
type XCastBranchNodeInput =
  | { nodeType: "else"; then: XCastNodeInput }
  | {
      nodeType: "condition";
      conditionType: "if" | "elseIf";
      condition: z.infer<typeof xCastConditionSchema>;
      then: XCastNodeInput;
      next?: XCastBranchNodeInput;
    };

const xCastBranchNodeSchema: z.ZodType<XCastBranchNodeInput> = z.lazy(() =>
  z.union([
    z.object({
      nodeType: z.literal("else"),
      then: xCastNodeSchema,
    }),
    z.object({
      nodeType: z.literal("condition"),
      conditionType: z.enum(["if", "elseIf"]),
      condition: xCastConditionSchema,
      then: xCastNodeSchema,
      next: xCastBranchNodeSchema.optional(),
    }),
  ]),
);

const xCastNodeSchema: z.ZodType<XCastNodeInput> = z.lazy(() =>
  z.union([xCastOutputSchema, xCastBranchNodeSchema]),
);

const xCastConditionNodeSchema = z.object({
  nodeType: z.literal("condition"),
  conditionType: z.literal("if"),
  condition: xCastConditionSchema,
  then: xCastNodeSchema,
  next: xCastBranchNodeSchema.optional(),
});

const xCastRuleSchema = z.object({
  kind: z.literal("xcast"),
  root: xCastConditionNodeSchema,
});

/** Body schema for `PUT /api/v1/coe-rule-builder` — the discriminated `Rule` union. */
export const ruleSaveSchema = z.object({
  pid: z.string().regex(PID_PATTERN),
  id: z.string().min(1),
  rule: z.discriminatedUnion("kind", [ruleSetRuleSchema, xCastRuleSchema]),
});
