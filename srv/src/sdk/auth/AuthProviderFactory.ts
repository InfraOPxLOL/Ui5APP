import type { IAuthProvider } from "./IAuthProvider.js";
import type { AuthProviderConfig } from "./AuthTypes.js";
import { BasicAuthProvider } from "./BasicAuthProvider.js";
import { OAuthClientCredentialsProvider } from "./OAuthClientCredentialsProvider.js";
import {
  PrincipalPropagationAuthProvider,
  SamlAuthProvider,
  X509AuthProvider,
} from "./FutureAuthProviders.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import { ConfigurationError } from "../../core/errors/ConfigurationError.js";

/**
 * Selects and constructs the {@link IAuthProvider} matching a configuration (architecture:
 * Authentication Framework, §2 — "Authentication should be selected using configuration").
 *
 * The SDK itself never reads the platform's `config/*.json` files (it must stay independent and
 * reusable in other Node.js projects); the caller (the SDK composition root — see
 * `sdk/client/IntegrationSuiteSdkClient`) translates whatever configuration source it uses into an
 * {@link AuthProviderConfig} and passes it here.
 */
export class AuthProviderFactory {
  /**
   * Builds the auth provider selected by `config.type`.
   * @param config the auth provider configuration.
   * @param httpClient the HTTP client to use for mechanisms that fetch tokens (OAuth).
   * @returns the constructed provider.
   * @throws {ConfigurationError} when the selected type's required credentials are missing.
   */
  public static create(config: AuthProviderConfig, httpClient: IHttpClient): IAuthProvider {
    switch (config.type) {
      case "basic":
        if (config.basic === undefined) {
          throw new ConfigurationError('Auth type "basic" requires config.basic credentials.');
        }
        return new BasicAuthProvider(config.basic);
      case "oauth-client-credentials":
        if (config.oauthClientCredentials === undefined) {
          throw new ConfigurationError(
            'Auth type "oauth-client-credentials" requires config.oauthClientCredentials.',
          );
        }
        return new OAuthClientCredentialsProvider(config.oauthClientCredentials, httpClient);
      case "principal-propagation":
        return new PrincipalPropagationAuthProvider();
      case "x509":
        return new X509AuthProvider();
      case "saml":
        return new SamlAuthProvider();
      default: {
        const exhaustive: never = config.type;
        throw new ConfigurationError(`Unknown auth type: ${String(exhaustive)}`);
      }
    }
  }
}
