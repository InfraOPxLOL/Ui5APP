import { z } from "zod";

const PID_PATTERN = /^[A-Za-z0-9_.]+$/;

/** Query schema for `GET /api/v1/coe-registry?pid=…`. */
export const registryQuerySchema = z.object({
  pid: z.string().regex(PID_PATTERN),
});

/** Body schema for `PUT /api/v1/coe-registry` (edit a parameter value). */
export const registryUpdateSchema = z.object({
  pid: z.string().regex(PID_PATTERN),
  id: z.string().min(1),
  value: z.string().max(4000),
});

/** Query schema for `DELETE /api/v1/coe-registry?pid=…&id=…`. */
export const registryDeleteSchema = z.object({
  pid: z.string().regex(PID_PATTERN),
  id: z.string().min(1),
});
