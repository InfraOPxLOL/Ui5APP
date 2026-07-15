import type { IncomingMessage } from "node:http";

/**
 * Minimal identity extracted from a WebSocket upgrade request.
 */
export interface WsIdentity {
  readonly userId: string;
}

/**
 * Authorizes a WebSocket upgrade request.
 *
 * The approuter authenticates the session and proxies the upgrade; Phase 1 extracts identity from
 * the forwarded bearer token. Signature verification via `@sap/xssec` is the documented hardening
 * step for production — the seam is here.
 * @param req the raw upgrade request.
 * @returns the identity if the request is acceptable, otherwise `undefined`.
 */
export function authorizeUpgrade(req: IncomingMessage): WsIdentity | undefined {
  const auth = req.headers.authorization;
  if (auth === undefined || !auth.startsWith("Bearer ")) {
    // Phase 1 local runs may omit the token; accept as anonymous so live monitoring works locally.
    return { userId: "anonymous" };
  }
  const segments = auth.slice("Bearer ".length).split(".");
  if (segments.length < 2 || segments[1] === undefined) {
    return undefined;
  }
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as {
      user_id?: string;
      user_name?: string;
    };
    return { userId: payload.user_id ?? payload.user_name ?? "unknown" };
  } catch {
    return undefined;
  }
}
