import ApiClient from "../http/ApiClient";

/**
 * The authenticated user's session information as returned by `GET /api/v1/session/me`.
 */
export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  /** Effective XSUAA scopes (short names, without the `$XSAPPNAME.` prefix). */
  readonly scopes: readonly string[];
}

/**
 * Provides the current user's identity and effective scopes, fetched once from the backend.
 *
 * Client-side scope checks (via {@link SessionService.hasScope}) are used only to gate UI
 * affordances — hiding a purge button an operator cannot use. They are never the security boundary:
 * the backend re-validates the same scope on every state-changing request (architecture §14).
 */
export default class SessionService {
  private static instance: SessionService | undefined;
  private user: SessionUser | undefined;

  private constructor(private readonly client: ApiClient = ApiClient.getInstance()) {}

  /**
   * @returns the process-wide singleton session service.
   */
  public static getInstance(): SessionService {
    SessionService.instance ??= new SessionService();
    return SessionService.instance;
  }

  /**
   * Fetches and caches the current user. Awaited during bootstrap.
   * @returns the session user.
   */
  public async load(): Promise<SessionUser> {
    this.user ??= await this.client.get<SessionUser>("/session/me");
    return this.user;
  }

  /**
   * @returns the cached session user.
   * @throws {Error} if called before {@link SessionService.load} resolves.
   */
  public getUser(): SessionUser {
    if (this.user === undefined) {
      throw new Error("SessionService.load() must complete before getUser() is called.");
    }
    return this.user;
  }

  /**
   * @param scope the short scope name (e.g. `JmsQueue.Purge`).
   * @returns whether the current user holds the scope.
   */
  public hasScope(scope: string): boolean {
    return this.getUser().scopes.includes(scope);
  }
}
