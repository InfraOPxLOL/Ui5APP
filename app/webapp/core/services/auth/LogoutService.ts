/** Where the browser goes to finish signing out, or why it cannot. */
export type LogoutResult =
  | { readonly kind: "redirect"; readonly url: string }
  /** No approuter in front of the app (local development): there is no session to end. */
  | { readonly kind: "unavailable" };

/** The approuter's logout endpoint (`approuter/xs-app.json` → `logout.logoutEndpoint`). */
const LOGOUT_ENDPOINT = "/logout";
/** The page the approuter shows after logout, used when it returns no URL. */
const LOGGED_OUT_PAGE = "/logged-out.html";

/**
 * Signs the user out completely through the approuter: its session and the XSUAA session both end,
 * so the next sign-in issues a fresh token carrying the user's current role collections.
 *
 * The endpoint takes a POST with a CSRF token (SAP's recommended logout flow): fetch the token,
 * POST, and the approuter answers with the URL to send the browser to (XSUAA's logout, which then
 * returns to the public signed-out page). Navigating there is what ends the XSUAA session.
 */
export default class LogoutService {
  public constructor(
    private readonly fetchFn: typeof fetch = (input, init) => window.fetch(input, init),
    private readonly endpoint: string = LOGOUT_ENDPOINT,
  ) {}

  public async logout(): Promise<LogoutResult> {
    try {
      const probe = await this.fetchFn(this.endpoint, {
        method: "GET",
        headers: { "X-CSRF-Token": "Fetch" },
        credentials: "same-origin",
      });
      const token = probe.headers.get("X-CSRF-Token");
      if (token === null || token === "" || token.toLowerCase() === "required") {
        return { kind: "unavailable" };
      }
      const response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        credentials: "same-origin",
      });
      if (!response.ok) {
        return { kind: "unavailable" };
      }
      return { kind: "redirect", url: LogoutService.safeUrl((await response.text()).trim()) };
    } catch {
      return { kind: "unavailable" };
    }
  }

  /** Only an http(s) URL or a path on this host is followed; anything else goes to the signed-out page. */
  public static safeUrl(candidate: string): string {
    if (/^https:\/\//i.test(candidate) || /^http:\/\/localhost[:/]/i.test(candidate)) {
      return candidate;
    }
    if (candidate.startsWith("/") && !candidate.startsWith("//")) {
      return candidate;
    }
    return LOGGED_OUT_PAGE;
  }
}
