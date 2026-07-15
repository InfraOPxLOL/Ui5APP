import type { IDestinationDiscoveryProvider } from "./IDestinationDiscoveryProvider.js";
import type { DestinationDefinition, TenantDestinationBinding } from "./DestinationTypes.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import type { IAuthProvider } from "../auth/IAuthProvider.js";
import type { AuthProviderConfig, OAuthClientCredentialsConfig } from "../auth/AuthTypes.js";
import { OAuthClientCredentialsProvider } from "../auth/OAuthClientCredentialsProvider.js";
import { createOperationContext } from "../models/OperationContext.js";
import { createRequestContext } from "../models/RequestContext.js";
import { HttpErrorTranslator } from "../errors/HttpErrorTranslator.js";
import type { ErrorResponse } from "../models/ErrorResponse.js";
import { ConfigurationError } from "../../core/errors/ConfigurationError.js";

/** Non-secret connection details for the BTP Destination service's own API. */
export interface BtpDestinationServiceConfig {
  /** Destination-configuration API base URL (e.g. `https://<subaccount>.dest-configuration.<landscape>`). */
  readonly apiUrl: string;
}

/** The subset of a BTP Destination service lookup response this provider consumes. */
interface BtpDestinationConfiguration {
  readonly Name: string;
  readonly URL?: string;
  readonly Authentication: string;
  readonly User?: string;
  readonly Password?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly tokenServiceURL?: string;
  readonly scope?: string;
}

interface BtpDestinationLookupResponse {
  readonly destinationConfiguration: BtpDestinationConfiguration;
}

/**
 * Discovers destinations by looking each one up in the **SAP BTP Destination service**
 * (architecture: Destination Integration, §1 — "Support SAP BTP Destination Service").
 *
 * Authenticates to the Destination service itself using OAuth 2.0 Client Credentials (reusing
 * {@link OAuthClientCredentialsProvider} — the Destination service's own security is exactly that
 * grant, so no separate token-fetch logic is written here), then calls
 * `GET {apiUrl}/destination-configuration/v1/destinations/{name}` per bound tenant and translates the
 * response's `Authentication` type into the matching {@link AuthProviderConfig} — so a tenant's real
 * CPI credentials (Basic user/password, or OAuth client id/secret/token URL) are read **only** from
 * the Destination service's response, never from a configuration file or environment variable
 * (architecture: Authentication Framework — "No real credentials should be hardcoded").
 *
 * Swaps in for {@link StaticDestinationDiscoveryProvider} with no change to {@link DestinationResolver}
 * or anything above it — the whole point of the discovery seam introduced in Phase 4.
 */
export class BtpDestinationDiscoveryProvider implements IDestinationDiscoveryProvider {
  private readonly serviceAuth: IAuthProvider;

  public constructor(
    private readonly serviceConfig: BtpDestinationServiceConfig,
    serviceOAuthConfig: OAuthClientCredentialsConfig,
    private readonly bindings: readonly TenantDestinationBinding[],
    private readonly httpClient: IHttpClient,
  ) {
    this.serviceAuth = new OAuthClientCredentialsProvider(serviceOAuthConfig, httpClient);
  }

  /** @inheritdoc */
  public async listDestinations(): Promise<readonly DestinationDefinition[]> {
    return Promise.all(this.bindings.map((binding) => this.fetchDestination(binding)));
  }

  private async fetchDestination(
    binding: TenantDestinationBinding,
  ): Promise<DestinationDefinition> {
    const correlationId = crypto.randomUUID();
    const authHeaders = await this.serviceAuth.getAuthHeaders({
      tenantId: binding.tenantId,
      correlationId,
    });
    const context = createOperationContext(
      createRequestContext(binding.tenantId, { correlationId }),
      "destination.btp.lookup",
    );
    const response = await this.httpClient.execute(
      {
        method: "GET",
        url: `${this.serviceConfig.apiUrl}/destination-configuration/v1/destinations/${encodeURIComponent(binding.destinationName)}`,
        headers: authHeaders,
      },
      context,
    );
    if (!response.ok) {
      const errorResponse: ErrorResponse = {
        httpStatus: response.status,
        message: `Destination lookup failed for "${binding.destinationName}" (tenant "${binding.tenantId}").`,
        rawBody: response.bodyText,
      };
      throw HttpErrorTranslator.translate(binding.tenantId, errorResponse);
    }
    const payload = JSON.parse(response.bodyText ?? "{}") as BtpDestinationLookupResponse;
    return BtpDestinationDiscoveryProvider.toDefinition(binding, payload.destinationConfiguration);
  }

  private static toDefinition(
    binding: TenantDestinationBinding,
    destination: BtpDestinationConfiguration,
  ): DestinationDefinition {
    return {
      tenantId: binding.tenantId,
      destinationName: binding.destinationName,
      baseUrl: destination.URL ?? binding.fallbackBaseUrl,
      environment: binding.environment,
      authConfig: BtpDestinationDiscoveryProvider.toAuthConfig(binding, destination),
      default: binding.default,
    };
  }

  private static toAuthConfig(
    binding: TenantDestinationBinding,
    destination: BtpDestinationConfiguration,
  ): AuthProviderConfig {
    switch (destination.Authentication) {
      case "BasicAuthentication": {
        if (destination.User === undefined || destination.Password === undefined) {
          throw new ConfigurationError(
            `Destination "${binding.destinationName}" declares BasicAuthentication but is missing a User/Password.`,
          );
        }
        return {
          type: "basic",
          basic: { username: destination.User, password: destination.Password },
        };
      }
      case "OAuth2ClientCredentials": {
        if (
          destination.clientId === undefined ||
          destination.clientSecret === undefined ||
          destination.tokenServiceURL === undefined
        ) {
          throw new ConfigurationError(
            `Destination "${binding.destinationName}" declares OAuth2ClientCredentials but is missing clientId/clientSecret/tokenServiceURL.`,
          );
        }
        return {
          type: "oauth-client-credentials",
          oauthClientCredentials: {
            tokenUrl: destination.tokenServiceURL,
            clientId: destination.clientId,
            clientSecret: destination.clientSecret,
            scope: destination.scope,
          },
        };
      }
      default:
        throw new ConfigurationError(
          `Destination "${binding.destinationName}" uses unsupported Authentication type "${destination.Authentication}". ` +
            `Supported types: BasicAuthentication, OAuth2ClientCredentials.`,
        );
    }
  }
}
