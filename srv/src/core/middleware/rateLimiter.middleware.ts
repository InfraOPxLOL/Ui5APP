import type { Request, Response, NextFunction, RequestHandler } from "express";
import { HttpError } from "../errors/HttpError.js";

/** Options for the fixed-window in-memory rate limiter. */
export interface RateLimitOptions {
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Maximum requests allowed per key within the window. */
  readonly max: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Lightweight fixed-window rate limiter.
 *
 * Uses process memory only — consistent with the stateless-backend constraint, it is a per-instance
 * safety valve against runaway polling, not a distributed quota (which would need shared storage the
 * platform deliberately does not have). Keyed by authenticated user id, falling back to client IP.
 * @param options the window/limit configuration.
 * @returns an Express middleware enforcing the limit.
 */
export function rateLimiter(options: RateLimitOptions): RequestHandler {
  const windows = new Map<string, WindowState>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.security?.userId ?? req.ip ?? "anonymous";
    const now = Date.now();
    const state = windows.get(key);

    if (state === undefined || now >= state.resetAt) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (state.count >= options.max) {
      next(new HttpError(429, "RATE_LIMITED", "Too many requests; please retry shortly."));
      return;
    }

    state.count += 1;
    next();
  };
}
