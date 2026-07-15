/**
 * Barrel for the SDK's authentication framework. Consumers should depend on {@link IAuthProvider}
 * and construct providers via {@link AuthProviderFactory} rather than importing a concrete
 * provider class directly.
 */
export type { IAuthProvider } from "./IAuthProvider.js";
export {
  type AuthContext,
  type AuthProviderConfig,
  type AuthType,
  type BasicAuthCredentials,
  type CachedToken,
  type OAuthClientCredentialsConfig,
} from "./AuthTypes.js";
export { TokenCache } from "./TokenCache.js";
export { BasicAuthProvider } from "./BasicAuthProvider.js";
export { OAuthClientCredentialsProvider } from "./OAuthClientCredentialsProvider.js";
export {
  PrincipalPropagationAuthProvider,
  SamlAuthProvider,
  X509AuthProvider,
} from "./FutureAuthProviders.js";
export { AuthProviderFactory } from "./AuthProviderFactory.js";
