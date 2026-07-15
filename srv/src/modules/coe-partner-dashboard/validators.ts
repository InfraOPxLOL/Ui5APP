import { z } from "zod";

const PID_PATTERN = /^[A-Za-z0-9_.]+$/;

/** Query schema for `GET /api/v1/coe-partner-dashboard/detail?pid=…`. */
export const partnerDetailQuerySchema = z.object({
  pid: z.string().regex(PID_PATTERN),
});
