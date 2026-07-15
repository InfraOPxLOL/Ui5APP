import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { HttpError } from "../errors/HttpError.js";

/** The request parts a {@link validateRequest} schema can cover. */
export interface RequestSchemas {
  readonly params?: ZodType;
  readonly query?: ZodType;
  readonly body?: ZodType;
}

/**
 * Produces a middleware that validates request `params`, `query` and/or `body` against zod schemas
 * at the API boundary (architecture §14). Invalid input is rejected with a 422 before any service
 * runs; validated, typed values replace the raw request parts.
 * @param schemas the schemas to apply per request part.
 * @returns an Express validation middleware.
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params !== undefined) {
        req.params = schemas.params.parse(req.params) as Request["params"];
      }
      if (schemas.query !== undefined) {
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.body !== undefined) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(HttpError.validation("Request validation failed.", error.issues));
        return;
      }
      next(error);
    }
  };
}
