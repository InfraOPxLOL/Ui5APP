/**
 * Serializes and deserializes filter/view state to and from a URL query parameter.
 *
 * The URL is the source of truth for shareable state (architecture §15): filter and sort state
 * lives in a single opaque `state` query parameter so any "workspace" view is bookmarkable and
 * shareable between operators. State is JSON-encoded then base64url-encoded to keep it compact and
 * hash-router safe.
 */
export default class DeepLinkHelper {
  private static readonly paramName = "state";

  /**
   * Encodes an arbitrary serializable state object into a URL-safe token.
   * @param state the state to encode.
   * @returns a base64url token, or `""` for nullish input.
   */
  public static encode(state: Record<string, unknown> | null | undefined): string {
    if (state === null || state === undefined) {
      return "";
    }
    const json = JSON.stringify(state);
    return DeepLinkHelper.toBase64Url(json);
  }

  /**
   * Decodes a token produced by {@link DeepLinkHelper.encode}.
   * @param token the base64url token.
   * @returns the decoded state object, or `undefined` if the token is empty or malformed.
   */
  public static decode<T extends Record<string, unknown>>(
    token: string | null | undefined,
  ): T | undefined {
    if (token === null || token === undefined || token === "") {
      return undefined;
    }
    try {
      const json = DeepLinkHelper.fromBase64Url(token);
      return JSON.parse(json) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * @returns the query parameter name under which deep-link state is stored.
   */
  public static getParamName(): string {
    return DeepLinkHelper.paramName;
  }

  private static toBase64Url(value: string): string {
    return btoa(unescape(encodeURIComponent(value)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private static fromBase64Url(value: string): string {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(padded)));
  }
}
