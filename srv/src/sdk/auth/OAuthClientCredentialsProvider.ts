import type { IAuthProvider } from "./IAuthProvider.js";
import type { AuthContext, AuthType, OAuthClientCredentialsConfig } from "./AuthTypes.js";
import { TokenCache } from "./TokenCache.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import { createOperationContext } from "../models/OperationContext.js";
import { createRequestContext } from "../models/RequestContext.js";
import { HttpErrorTranslator } from "../errors/HttpErrorTranslator.js";
import type { ErrorResponse } from "../models/ErrorResponse.js";

/** The token endpoint's response shape (OAuth 2.0 §5.1). */
interface TokenEndpointResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

/**
 * OAuth 2.0 Client Credentials grant. Requests a bearer token from `config.tokenUrl`, caches it
 * for its lifetime (via {@link TokenCache}) and refreshes automatically once it is within the
 * cache's expiry skew of expiring — callers never see the token-fetch round trip on every call.
 *
 * Depends on {@link IHttpClient} (never `fetch` directly, per the HTTP Infrastructure mandate) so
 * the token fetch itself benefits from retry/timeout/logging like any other SDK call.
 */
export class OAuthClientCredentialsProvider implements IAuthProvider {
  public readonly type: AuthType = "oauth-client-credentials";
  private readonly cacheKey: string;

  public constructor(
    private readonly config: OAuthClientCredentialsConfig,
    private readonly httpClient: IHttpClient,
    private readonly cache: TokenCache = new TokenCache(),
  ) {
    this.cacheKey = `${config.clientId}@${config.tokenUrl}`;
  }

  /** @inheritdoc */
  public async getAuthHeaders(context: AuthContext): Promise<Readonly<Record<string, string>>> {
    const cached = this.cache.get(this.cacheKey);
    if (cached !== undefined) {
      return { Authorization: `Bearer ${cached.value}` };
    }
    const token = await this.fetchToken(context);
    return { Authorization: `Bearer ${token}` };
  }

  private async fetchToken(context: AuthContext): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...(this.config.scope !== undefined ? { scope: this.config.scope } : {}),
    }).toString();

    const operationContext = createOperationContext(
      createRequestContext(context.tenantId, { correlationId: context.correlationId }),
      "auth.oauthClientCredentials.fetchToken",
    );

    const response = await this.httpClient.execute(
      {
        method: "POST",
        url: this.config.tokenUrl,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: { encoding: "text", value: body },
      },
      operationContext,
    );

    if (!response.ok) {
      const errorResponse: ErrorResponse = {
        httpStatus: response.status,
        message: `OAuth token request failed with status ${response.status}.`,
        rawBody: response.bodyText,
      };
      throw HttpErrorTranslator.translate(context.tenantId, errorResponse);
    }

    const payload = JSON.parse(response.bodyText ?? "{}") as TokenEndpointResponse;
    this.cache.set(this.cacheKey, payload.access_token, payload.expires_in * 1000);
    return payload.access_token;
  }
}
