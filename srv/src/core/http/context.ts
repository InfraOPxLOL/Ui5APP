import type { Logger } from "pino";

/**
 * The authenticated security context derived from the inbound XSUAA JWT.
 */
export interface SecurityContext {
  readonly userId: string;
  readonly userName: string;
  readonly email: string;
  /** Effective scopes, with the `$XSAPPNAME.` prefix stripped to short names. */
  readonly scopes: readonly string[];
}

/**
 * Per-request context attached to the Express request by the core middleware. Declared as an
 * ambient augmentation so every handler has typed access to `req.correlationId`, `req.log` and
 * `req.security` without importing anything.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id for this request (generated or propagated from the edge). */
      correlationId: string;
      /** Request-scoped logger with the correlation id bound. */
      log: Logger;
      /** Authenticated security context (populated by the auth middleware). */
      security?: SecurityContext;
      /** Business logic layer initialized per-request. */
      operationsEngine: import("../../operations/OperationsEngine.js").OperationsEngine;
    }
  }
}

export {};
