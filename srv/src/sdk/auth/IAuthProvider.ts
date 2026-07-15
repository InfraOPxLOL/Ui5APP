import type { AuthContext, AuthType } from "./AuthTypes.js";

/**
 * Produces the headers needed to authenticate one outbound call. The single seam every
 * authentication mechanism implements (architecture: Authentication Framework, §2); the request
 * pipeline's auth middleware calls {@link IAuthProvider.getAuthHeaders} and merges the result into
 * the outbound request — nothing else in the SDK knows how any given tenant authenticates.
 */
export interface IAuthProvider {
  /** Which mechanism this provider implements. */
  readonly type: AuthType;

  /**
   * Produces the auth headers for one call, refreshing/caching credentials as needed.
   * @param context the tenant/correlation context the headers are being produced for.
   * @returns headers to merge into the outbound request (e.g. `{ Authorization: "Bearer …" }`).
   */
  getAuthHeaders(context: AuthContext): Promise<Readonly<Record<string, string>>>;
}
