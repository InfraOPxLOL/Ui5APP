import type { IHttpClient } from "../http/IHttpClient.js";
import type { OperationContext } from "../models/OperationContext.js";
import type { TenantContext } from "../models/TenantContext.js";

/** The CSRF token + session cookies captured from a `X-CSRF-Token: Fetch` handshake. */
export interface CsrfHandshake {
  readonly token: string | undefined;
  /** A ready-to-send `Cookie` header value, or `undefined` when the tenant set no cookies. */
  readonly cookie: string | undefined;
}

/**
 * Performs Cloud Integration's CSRF handshake: a GET on the API service root with
 * `X-CSRF-Token: Fetch`, returning the issued token and the session cookies it is bound to.
 *
 * Every modifying call on the `/api/v1` OData surface (POST function imports such as
 * `MoveMessagingMessages`, PUT, DELETE) needs this, even with an OAuth bearer token — without it the
 * tenant answers `403 CSRF token validation failed` and changes nothing. The token is only valid
 * together with the session it was issued in (`JSESSIONID`, plus the platform's `__VCAP_ID__`
 * instance-affinity cookie), so every cookie must be replayed, not just the first or last one.
 *
 * Best-effort: a tenant that does not require CSRF returns no token, and the write proceeds without one.
 */
export async function fetchCsrfHandshake(
  httpClient: IHttpClient,
  tenant: TenantContext,
  context: OperationContext,
): Promise<CsrfHandshake> {
  const response = await httpClient.execute(
    {
      method: "GET",
      url: `${tenant.baseUrl}/`,
      headers: { ...tenant.headers, Accept: "application/json", "X-CSRF-Token": "Fetch" },
    },
    context,
  );
  return {
    token: response.headers.get("x-csrf-token"),
    cookie: toCookieHeader(response.headers.get("set-cookie")),
  };
}

/**
 * Headers for a modifying request: the tenant's auth headers, `Accept: application/json` (this
 * OData v2 surface otherwise answers in Atom/XML), and the handshake's token and cookies.
 */
export function csrfWriteHeaders(
  tenant: TenantContext,
  csrf: CsrfHandshake,
): Record<string, string> {
  const headers: Record<string, string> = { ...tenant.headers, Accept: "application/json" };
  if (csrf.token !== undefined) {
    headers["X-CSRF-Token"] = csrf.token;
  }
  if (csrf.cookie !== undefined) {
    headers.Cookie = csrf.cookie;
  }
  return headers;
}

/**
 * Turns `Set-Cookie` response values into a `Cookie` request header: keeps each cookie's
 * `name=value` and drops its attributes (`Path`, `Secure`, `Expires`, …). The HTTP layer joins
 * multiple `Set-Cookie` headers with a newline, which can never occur inside a header value.
 * @param setCookie the raw `set-cookie` value, possibly several joined by `\n`.
 * @returns the `Cookie` header value, or `undefined` when there is nothing to send.
 */
export function toCookieHeader(setCookie: string | undefined): string | undefined {
  if (setCookie === undefined) {
    return undefined;
  }
  const pairs = setCookie
    .split("\n")
    .map((cookie) => cookie.split(";")[0]?.trim() ?? "")
    .filter((pair) => pair.includes("="));
  return pairs.length === 0 ? undefined : pairs.join("; ");
}
