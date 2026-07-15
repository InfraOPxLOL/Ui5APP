import type { IDestinationResolver } from "./IDestinationResolver.js";
import type { IDestinationDiscoveryProvider } from "./IDestinationDiscoveryProvider.js";
import type {
  DeploymentEnvironment,
  DestinationDefinition,
  DestinationResolveOptions,
} from "./DestinationTypes.js";
import type { TenantContext } from "../models/TenantContext.js";
import type { IAuthProvider } from "../auth/IAuthProvider.js";
import { AuthProviderFactory } from "../auth/AuthProviderFactory.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import { ConfigurationError } from "../../core/errors/ConfigurationError.js";

/**
 * The SDK's destination resolver (architecture: Destination Framework, §3).
 *
 * Delegates *which* destinations exist to an {@link IDestinationDiscoveryProvider} (today: a
 * static list; tomorrow: a live lookup) and *how to authenticate* each one to the Authentication
 * Framework — this class only does the resolution and auth-provider lifecycle management (one
 * provider instance per tenant, cached, so token caches persist across calls).
 */
export class DestinationResolver implements IDestinationResolver {
  private readonly authProviders = new Map<string, IAuthProvider>();

  public constructor(
    private readonly discovery: IDestinationDiscoveryProvider,
    private readonly httpClient: IHttpClient,
  ) {}

  /** @inheritdoc */
  public async resolve(options: DestinationResolveOptions): Promise<TenantContext> {
    const definition = await this.findDefinition(options.tenantId);
    const provider = this.getOrCreateAuthProvider(definition);
    const headers = await provider.getAuthHeaders({
      tenantId: definition.tenantId,
      correlationId: options.correlationId,
    });
    return {
      tenantId: definition.tenantId,
      baseUrl: definition.baseUrl,
      headers,
      destinationName: definition.destinationName,
    };
  }

  /** @inheritdoc */
  public async listEnvironments(): Promise<readonly DeploymentEnvironment[]> {
    const definitions = await this.discovery.listDestinations();
    return Array.from(new Set(definitions.map((definition) => definition.environment)));
  }

  private async findDefinition(tenantId: string | undefined): Promise<DestinationDefinition> {
    const definitions = await this.discovery.listDestinations();
    const definition =
      tenantId !== undefined
        ? definitions.find((candidate) => candidate.tenantId === tenantId)
        : (definitions.find((candidate) => candidate.default) ?? definitions[0]);
    if (definition === undefined) {
      throw new ConfigurationError(
        `No destination is configured for tenant "${tenantId ?? "(default)"}".`,
      );
    }
    return definition;
  }

  private getOrCreateAuthProvider(definition: DestinationDefinition): IAuthProvider {
    let provider = this.authProviders.get(definition.tenantId);
    if (provider === undefined) {
      provider = AuthProviderFactory.create(definition.authConfig, this.httpClient);
      this.authProviders.set(definition.tenantId, provider);
    }
    return provider;
  }
}
