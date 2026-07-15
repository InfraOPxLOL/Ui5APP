/**
 * The authentication mechanisms the SDK's auth framework can select between (architecture:
 * Authentication Framework, §2). Selection is configuration-driven — see
 * {@link AuthProviderFactory} — never hardcoded per call site.
 *
 * - `basic` and `oauth-client-credentials` are implemented now.
 * - `principal-propagation`, `x509` and `saml` are documented future extension points: their
 *   providers exist and satisfy {@link IAuthProvider} so the factory and type system already
 *   account for them, but each throws a clear, typed error until a future phase implements it —
 *   never a silent no-op.
 */
export type AuthType =
  | "basic"
  | "oauth-client-credentials"
  | "principal-propagation"
  | "x509"
  | "saml";

/** Minimal context an {@link IAuthProvider} needs to produce headers for one call. */
export interface AuthContext {
  readonly tenantId: string;
  readonly correlationId: string;
}

/** Credentials for HTTP Basic authentication. Never hardcoded — resolved from a Destination at runtime. */
export interface BasicAuthCredentials {
  readonly username: string;
  readonly password: string;
}

/** Configuration for the OAuth 2.0 Client Credentials grant. */
export interface OAuthClientCredentialsConfig {
  /** The token endpoint URL. */
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Optional space-separated OAuth scope(s) to request. */
  readonly scope?: string;
}

/**
 * The configuration selecting and parameterizing one {@link IAuthProvider}, consumed by
 * {@link AuthProviderFactory.create}. Exactly the branch matching `type` needs to be populated.
 */
export interface AuthProviderConfig {
  readonly type: AuthType;
  readonly basic?: BasicAuthCredentials;
  readonly oauthClientCredentials?: OAuthClientCredentialsConfig;
}

/** A cached bearer/session token with its absolute expiry. */
export interface CachedToken {
  readonly value: string;
  /** Absolute expiry, epoch milliseconds. */
  readonly expiresAt: number;
}
