import type { IAuthProvider } from "./IAuthProvider.js";
import type { AuthContext, AuthType, BasicAuthCredentials } from "./AuthTypes.js";

/**
 * HTTP Basic authentication. Credentials are injected at construction (resolved by the Destination
 * framework from a BTP Destination at runtime) — never hardcoded or read from a config file.
 */
export class BasicAuthProvider implements IAuthProvider {
  public readonly type: AuthType = "basic";

  public constructor(private readonly credentials: BasicAuthCredentials) {}

  /** @inheritdoc */
  public getAuthHeaders(_context: AuthContext): Promise<Readonly<Record<string, string>>> {
    const token = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString(
      "base64",
    );
    return Promise.resolve({ Authorization: `Basic ${token}` });
  }
}
