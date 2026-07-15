import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { SecurityContext } from "../http/context.js";
import { toShortScope } from "../../config/xsuaa.js";
import { HttpError } from "../errors/HttpError.js";
import { configService } from "../../config/ConfigService.js";

/**
 * Authentication & authorization middleware.
 *
 * The approuter authenticates the user against XSUAA and forwards the JWT. This middleware derives
 * the {@link SecurityContext} from that token and attaches it to the request. Scope checks against
 * this context are the server-side security boundary (the client-side checks are only for hiding
 * UI affordances — architecture §14).
 *
 * NOTE: Phase 1 decodes the forwarded JWT to read identity and scopes. Cryptographic verification
 * of the token signature (via `@sap/xssec`) is the single documented hardening step to add before
 * production — the seam is {@link deriveSecurityContext}; nothing else changes.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const context = deriveSecurityContext(req);
  if (context !== undefined) {
    req.security = context;
  }
  next();
}

/**
 * Produces a middleware that enforces the presence of a scope, responding 403 otherwise.
 * @param scope the required short scope name (e.g. `JmsQueue.Purge`).
 * @returns an Express middleware enforcing the scope.
 */
export function requireScope(scope: string): RequestHandler {
  return (req, _res, next) => {
    if (req.security === undefined) {
      next(HttpError.unauthorized());
      return;
    }
    if (!req.security.scopes.includes(scope)) {
      next(HttpError.forbidden(`Missing required scope: ${scope}`));
      return;
    }
    next();
  };
}

interface JwtPayload {
  readonly user_id?: string;
  readonly user_name?: string;
  readonly email?: string;
  readonly scope?: string[];
}

function deriveSecurityContext(req: Request): SecurityContext | undefined {
  const payload = decodeBearer(req.header("authorization"));
  if (payload === undefined) {
    if (configService.getEnvironment().kind === "development") {
      return {
        userId: "local-dev",
        userName: "Local Developer",
        email: "dev@middlewareops.com",
        scopes: [
          "Viewer",
          "Operator",
          "Administrator",
          "MessageReplay.Execute",
          "JmsQueue.Purge",
          "Administration.Manage"
        ]
      };
    }
    return undefined;
  }
  return {
    userId: payload.user_id ?? payload.user_name ?? "unknown",
    userName: payload.user_name ?? "unknown",
    email: payload.email ?? "",
    scopes: (payload.scope ?? []).map(toShortScope),
  };
}

function decodeBearer(header: string | undefined): JwtPayload | undefined {
  if (header === undefined || !header.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length);
  const segments = token.split(".");
  if (segments.length < 2 || segments[1] === undefined) {
    return undefined;
  }
  try {
    const json = Buffer.from(segments[1], "base64url").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return undefined;
  }
}
