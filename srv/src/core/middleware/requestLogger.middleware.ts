import type { Request, Response, NextFunction } from "express";

/**
 * Emits one structured log line per request on completion, capturing method, route, status and
 * duration against the request-scoped (correlation-bound) logger. Kept deliberately minimal — one
 * line per request is the baseline the architecture calls for (§10).
 * @param req the request.
 * @param res the response.
 * @param next the next middleware.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    req.log.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        user: req.security?.userId,
      },
      "request.completed",
    );
  });
  next();
}
