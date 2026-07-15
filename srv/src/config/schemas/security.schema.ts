import { z } from "zod";

/**
 * Schema for `config/security.json` — transport-security knobs consumed by the Express assembly.
 * Authentication/authorization themselves are NOT configured here (XSUAA scopes live in
 * `xs-security.json`; credentials live in the Destination service).
 *
 * Properties:
 * - `cors.allowedOrigins`   — explicit CORS allow-list. Empty array = same-origin deployment
 *                             (approuter fronting the backend), which permissively reflects the
 *                             request origin only in `development` environments.
 * - `rateLimit.windowMs`    — fixed-window length for the per-user in-memory rate limiter.
 * - `rateLimit.maxRequests` — requests allowed per user per window.
 * - `requestBodyLimitKb`    — maximum accepted JSON request body size, in kilobytes.
 * - `csrf.enabled`          — whether the CSRF token endpoint/handshake is active (the approuter
 *                             additionally enforces CSRF on deployed routes).
 */
export const securitySchema = z.object({
  cors: z.object({
    allowedOrigins: z.array(z.string().url()).default([]),
  }),
  rateLimit: z.object({
    windowMs: z.number().int().min(1000),
    maxRequests: z.number().int().min(1),
  }),
  requestBodyLimitKb: z.number().int().min(1).max(51200),
  csrf: z.object({
    enabled: z.boolean(),
  }),
});

/** Typed view of `config/security.json`. */
export type SecurityConfig = z.infer<typeof securitySchema>;
