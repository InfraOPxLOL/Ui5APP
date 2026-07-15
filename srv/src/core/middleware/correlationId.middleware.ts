import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { childLogger } from "../logging/logger.js";

/** Header carrying the correlation id across service boundaries. */
export const CORRELATION_HEADER = "x-correlation-id";

/**
 * Assigns a correlation id to every request (propagating an inbound one from the edge/approuter, or
 * generating a fresh UUID), attaches a request-scoped logger, and echoes the id on the response.
 * This is the first middleware in the chain so everything downstream can log correlatably.
 * @param req the request.
 * @param res the response.
 * @param next the next middleware.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  const correlationId = incoming !== undefined && incoming !== "" ? incoming : randomUUID();
  req.correlationId = correlationId;
  req.log = childLogger(correlationId);
  res.setHeader(CORRELATION_HEADER, correlationId);
  next();
}
