import { configService } from "./ConfigService.js";
import { env, getTenantCredential } from "./env.js";
import type { TenantAuthConfig } from "./schemas/index.js";
import {
  IntegrationSuiteSdkClient,
  type IntegrationSuiteSdkClientOptions,
  type RealProviderDependencies,
} from "../sdk/client/index.js";
import {
  FetchHttpClient,
  CorrelationIdInterceptor,
  LoggingInterceptor,
  MetricsInterceptor,
  type IHttpClient,
} from "../sdk/http/index.js";
import {
  DestinationResolver,
  StaticDestinationDiscoveryProvider,
  BtpDestinationDiscoveryProvider,
  type IDestinationResolver,
  type DestinationDefinition,
  type TenantDestinationBinding,
} from "../sdk/destination/index.js";
import type { AuthProviderConfig } from "../sdk/auth/index.js";
import type { MockEngineConfig } from "../sdk/mock/index.js";
import { ConfigurationError } from "../core/errors/ConfigurationError.js";

/**
 * Builds the {@link IntegrationSuiteSdkClient} from this application's own configuration
 * (`config/connectivity.json`, `config/tenants.json`, plus environment-scoped secrets) — the one
 * place the platform's config format meets the SDK's deliberately config-agnostic composition root
 * (architecture: Phase 5 — "The implementation should be selected automatically through
 * configuration"). The SDK itself never reads `config/*.json` (see `AuthProviderFactory`'s doc
 * comment for why); this factory is the translation layer, exactly as `sdk/destination`'s own doc
 * comments anticipated.
 *
 * Not called anywhere yet — no module consumes the SDK client in this phase (Phase 4's client doc
 * comment already noted this; Phase 5 only completes the provider layer it composes). A future
 * phase's module services call this once at startup and inject the resulting client.
 * @param mockEngineConfig configuration for the {@link MockEngine} every mode still partly depends on
 *   (`apiManagement`, `designTime` — see `IntegrationSuiteSdkClientOptions`'s doc comment).
 * @returns the composed SDK client, wired to mock or real providers per `connectivity.json`.
 * @throws {ConfigurationError} when `real` mode is selected but required configuration/secrets are missing.
 */
export function createIntegrationSuiteSdkClient(
  mockEngineConfig: MockEngineConfig,
): IntegrationSuiteSdkClient {
  const connectivity = configService.getConnectivity();
  const defaultTenant = configService.getTenant();

  if (connectivity.mode === "mock") {
    const options: IntegrationSuiteSdkClientOptions = {
      defaultTenantId: defaultTenant.id,
      mockEngineConfig,
      providerMode: "mock",
    };
    return new IntegrationSuiteSdkClient(options);
  }

  const httpClient = buildHttpClient();
  const destinationResolver = buildDestinationResolver(httpClient);
  const real: RealProviderDependencies = { destinationResolver, httpClient };
  const options: IntegrationSuiteSdkClientOptions = {
    defaultTenantId: defaultTenant.id,
    mockEngineConfig,
    providerMode: "real",
    real,
  };
  return new IntegrationSuiteSdkClient(options);
}

function buildHttpClient(): IHttpClient {
  return new FetchHttpClient({
    interceptors: [
      new CorrelationIdInterceptor(),
      new LoggingInterceptor(),
      new MetricsInterceptor(),
    ],
  });
}

function buildTenantBindings(): readonly TenantDestinationBinding[] {
  const environmentKind = configService.getEnvironment().kind;
  return configService
    .getTenants()
    .filter((tenant) => tenant.enabled)
    .map((tenant) => ({
      tenantId: tenant.id,
      destinationName: tenant.destinationName,
      environment: environmentKind,
      fallbackBaseUrl: tenant.baseUrl,
      default: tenant.default,
    }));
}

function buildDestinationResolver(httpClient: IHttpClient): IDestinationResolver {
  const connectivity = configService.getConnectivity();
  const bindings = buildTenantBindings();

  if (connectivity.destinationDiscovery === "btp") {
    if (env.destinationService === undefined) {
      throw new ConfigurationError(
        'connectivity.json: destinationDiscovery is "btp" but DESTINATION_SERVICE_URL/_TOKEN_URL/' +
          "_CLIENT_ID/_CLIENT_SECRET environment variables are not set.",
      );
    }
    const discovery = new BtpDestinationDiscoveryProvider(
      { apiUrl: env.destinationService.url },
      {
        tokenUrl: env.destinationService.tokenUrl,
        clientId: env.destinationService.clientId,
        clientSecret: env.destinationService.clientSecret,
      },
      bindings,
      httpClient,
    );
    return new DestinationResolver(discovery, httpClient);
  }

  const definitions = buildStaticDestinationDefinitions(bindings);
  return new DestinationResolver(new StaticDestinationDiscoveryProvider(definitions), httpClient);
}

function buildStaticDestinationDefinitions(
  bindings: readonly TenantDestinationBinding[],
): readonly DestinationDefinition[] {
  const connectivity = configService.getConnectivity();
  return bindings.map((binding) => {
    const authEntry = connectivity.tenantAuth.find((entry) => entry.tenantId === binding.tenantId);
    if (authEntry === undefined) {
      throw new ConfigurationError(
        `connectivity.json: no tenantAuth entry for tenant "${binding.tenantId}" (required when ` +
          'destinationDiscovery is "static" and mode is "real").',
      );
    }
    return {
      tenantId: binding.tenantId,
      destinationName: binding.destinationName,
      baseUrl: binding.fallbackBaseUrl,
      environment: binding.environment,
      authConfig: buildAuthConfig(binding.tenantId, authEntry),
      default: binding.default,
    };
  });
}

function buildAuthConfig(tenantId: string, authEntry: TenantAuthConfig): AuthProviderConfig {
  if (authEntry.type === "basic") {
    const username = getTenantCredential(tenantId, "USERNAME");
    const password = getTenantCredential(tenantId, "PASSWORD");
    if (username === undefined || password === undefined) {
      throw new ConfigurationError(
        `Missing CPI_${tenantId.toUpperCase()}_USERNAME / _PASSWORD environment variables for tenant "${tenantId}".`,
      );
    }
    return { type: "basic", basic: { username, password } };
  }

  const clientId = getTenantCredential(tenantId, "CLIENT_ID");
  const clientSecret = getTenantCredential(tenantId, "CLIENT_SECRET");
  if (clientId === undefined || clientSecret === undefined) {
    throw new ConfigurationError(
      `Missing CPI_${tenantId.toUpperCase()}_CLIENT_ID / _CLIENT_SECRET environment variables for tenant "${tenantId}".`,
    );
  }
  if (authEntry.oauthTokenUrl === undefined) {
    // Unreachable in practice: `connectivitySchema` already requires `oauthTokenUrl` whenever
    // `type` is "oauth-client-credentials" — this is a defensive fallback, not the primary check.
    throw new ConfigurationError(
      `connectivity.json: tenantAuth entry for "${tenantId}" is missing oauthTokenUrl.`,
    );
  }
  return {
    type: "oauth-client-credentials",
    oauthClientCredentials: {
      tokenUrl: authEntry.oauthTokenUrl,
      clientId,
      clientSecret,
      scope: authEntry.oauthScope,
    },
  };
}
