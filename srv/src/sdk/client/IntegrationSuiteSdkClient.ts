import { MockEngine } from "../mock/MockEngine.js";
import type { MockEngineConfig } from "../mock/MockTypes.js";
import {
  MockAlertProvider,
  MockCertificateProvider,
  MockJmsProvider,
  MockMonitoringProvider,
  MockPartnerDirectoryProvider,
  MockPayloadProvider,
  MockRuntimeProvider,
  MockSplunkProvider,
  MockValueMappingProvider,
  RealAlertProvider,
  RealCertificateProvider,
  RealJmsProvider,
  RealMonitoringProvider,
  RealPartnerDirectoryProvider,
  RealPayloadProvider,
  RealRuntimeProvider,
  RealValueMappingProvider,
  type AlertNotificationServiceConfig,
  type JmsProviderEndpoints,
  type ValueMappingProviderEndpoints,
} from "../providers/index.js";
import type { IDestinationResolver } from "../destination/IDestinationResolver.js";
import type { IHttpClient } from "../http/IHttpClient.js";
import { RequestPipeline } from "../pipeline/RequestPipeline.js";
import { ConfigurationError } from "../../core/errors/ConfigurationError.js";
import { MonitoringClient } from "./MonitoringClient.js";
import { RuntimeClient } from "./RuntimeClient.js";
import { JmsClient } from "./JmsClient.js";
import { PayloadClient } from "./PayloadClient.js";
import { SplunkClient } from "./SplunkClient.js";
import { PartnerDirectoryClient } from "./PartnerDirectoryClient.js";
import { CertificateClient } from "./CertificateClient.js";
import { ValueMappingClient } from "./ValueMappingClient.js";
import { SecurityMaterialClient } from "./SecurityMaterialClient.js";
import { ApiManagementClient } from "./ApiManagementClient.js";
import { AlertNotificationClient } from "./AlertNotificationClient.js";
import { DesignTimeClient } from "./DesignTimeClient.js";

/** The provider implementation every domain sub-client is wired to (see {@link IntegrationSuiteSdkClientOptions.providerMode}). */
export type IntegrationSuiteProviderMode = "mock" | "real";

/**
 * Dependencies required to construct the SDK's live, Integration-Suite-backed providers — only
 * needed when `providerMode` is `"real"` (architecture: Phase 5 — "replaces mock providers with real
 * Integration Suite providers"). The SDK itself never builds these from configuration (it must stay
 * independent of this application's config format); the composition root does, then passes the
 * finished objects in here — the same dependency-injection discipline `AuthProviderFactory` and
 * `DestinationResolver` already follow.
 */
export interface RealProviderDependencies {
  /** Resolves tenant connectivity (base URL + live auth headers) for every CPI-backed provider. */
  readonly destinationResolver: IDestinationResolver;
  /** The shared HTTP transport every real provider issues requests through. */
  readonly httpClient: IHttpClient;
  /** Overrides the default JMS entity-set names (see `RealJmsProvider`'s doc comment). */
  readonly jmsEndpoints?: JmsProviderEndpoints;
  /** Overrides the default Value Mapping entity-set name (see `RealValueMappingProvider`'s doc comment). */
  readonly valueMappingEndpoints?: ValueMappingProviderEndpoints;
  /**
   * Connection to the SAP Alert Notification Service. Optional: when omitted, alerts continue to be
   * served by the shared {@link MockEngine} (i.e. the platform's local sweeps are the only source),
   * matching {@link IAlertProvider}'s "may fan in multiple sources" contract.
   */
  readonly alertNotification?: AlertNotificationServiceConfig;
}

/** Configuration for {@link IntegrationSuiteSdkClient}. */
export interface IntegrationSuiteSdkClientOptions {
  /** Tenant used by every sub-client method call that doesn't specify one explicitly. */
  readonly defaultTenantId: string;
  /**
   * Configuration for the shared {@link MockEngine}. Still constructed and used even when
   * `providerMode` is `"real"`: `apiManagement` and `designTime` have no Phase-3 provider contract
   * of their own (see their own client doc comments) and remain mock-engine-backed regardless of
   * mode. (`jms.retryMessage` was once on this list; it is provider-backed since the Cloud
   * Integration JMS OData API's `RetryMessagingMessages` function import was adopted.)
   */
  readonly mockEngineConfig: MockEngineConfig;
  /** Which provider implementation every domain sub-client is wired to. Defaults to `"mock"` — unset, this is exactly Phase 4's behaviour. */
  readonly providerMode?: IntegrationSuiteProviderMode;
  /** Required when `providerMode` is `"real"`. */
  readonly real?: RealProviderDependencies;
}

/**
 * The SDK's root entry point (architecture: Integration Suite Client, §4).
 *
 * Composes and exposes one sub-client per Integration Suite capability area, wired to either the
 * mock-data providers (`sdk/providers/Mock*`) built in Phase 4 or the live, Integration-Suite-backed
 * providers (`sdk/providers/Real*`) built in Phase 5 — selected by `options.providerMode`, never by
 * a code change (architecture: Phase 5 — "The implementation should be selected automatically
 * through configuration"). Every sub-client's own public shape is unchanged either way: this
 * composition root is the *only* place that knows which concrete provider class backs a given
 * sub-client.
 *
 * This is the only class module code outside the SDK should ever construct or depend on; nothing
 * above it should import `sdk/http`, `sdk/providers`, etc. directly (architecture: "Every future
 * module must communicate ONLY through this SDK").
 */
export class IntegrationSuiteSdkClient {
  /** Message/Live Monitoring and Dashboard data. */
  public readonly monitoring: MonitoringClient;
  /** Deployed runtime artifact state. */
  public readonly runtime: RuntimeClient;
  /** JMS queue runtime state, message management and retry. */
  public readonly jms: JmsClient;
  /** Message payload/attachment access. */
  public readonly payload: PayloadClient;
  /** Certificate/keystore access. */
  public readonly certificate: CertificateClient;
  /** Value mapping scheme access. */
  public readonly valueMapping: ValueMappingClient;
  /** Security materials (certificate/keystore subset today; see its own README note). */
  public readonly securityMaterial: SecurityMaterialClient;
  /** API Management proxy listing and traffic summary. */
  public readonly apiManagement: ApiManagementClient;
  /** Alert events (local sweeps and/or SAP Alert Notification Service). */
  public readonly alertNotification: AlertNotificationClient;
  /** Design-time integration application browsing. */
  public readonly designTime: DesignTimeClient;
  /**
   * Splunk-backed payload fallback, for messages recording no MPL attachments on the tenant
   * itself. Wired to {@link MockSplunkProvider} unconditionally, regardless of `providerMode` —
   * unlike `apiManagement`/`designTime` (which stay mock because they have no Phase-3 provider
   * contract of their own), `splunk` *does* have a real contract (`ISplunkProvider`) but is
   * mock-only today because real Splunk search-API querying isn't reachable from this trial
   * tenant — an environmental constraint, not an architectural gap. A future `RealSplunkProvider`
   * would slot in here exactly like `RealPayloadProvider` did.
   */
  public readonly splunk: SplunkClient;
  /**
   * Partner Directory read/write access (`StringParameters`) — the backing store for the CoE
   * Framework's configuration surfaces. Uses the real, live provider in `"real"` mode (the first
   * SDK surface performing tenant *writes* beyond JMS message actions) and a stateful seeded mock
   * otherwise.
   */
  public readonly partnerDirectory: PartnerDirectoryClient;

  private readonly mockEngine: MockEngine;
  private readonly providerMode: IntegrationSuiteProviderMode;

  public constructor(options: IntegrationSuiteSdkClientOptions) {
    this.mockEngine = new MockEngine(options.mockEngineConfig);
    this.providerMode = options.providerMode ?? "mock";
    const tenantId = options.defaultTenantId;

    if (this.providerMode === "real") {
      if (options.real === undefined) {
        throw new ConfigurationError(
          'IntegrationSuiteSdkClient: providerMode "real" requires `real` dependencies (destinationResolver, httpClient).',
        );
      }
      const { destinationResolver, httpClient } = options.real;
      const pipeline = new RequestPipeline(destinationResolver);

      this.monitoring = new MonitoringClient(
        new RealMonitoringProvider(pipeline, httpClient),
        tenantId,
      );
      this.runtime = new RuntimeClient(new RealRuntimeProvider(pipeline, httpClient), tenantId);
      this.jms = new JmsClient(
        new RealJmsProvider(pipeline, httpClient, options.real.jmsEndpoints),
        tenantId,
      );
      this.payload = new PayloadClient(new RealPayloadProvider(pipeline, httpClient), tenantId);
      const certificateProvider = new RealCertificateProvider(pipeline, httpClient);
      this.certificate = new CertificateClient(certificateProvider, tenantId);
      this.valueMapping = new ValueMappingClient(
        new RealValueMappingProvider(pipeline, httpClient, options.real.valueMappingEndpoints),
        tenantId,
      );
      this.securityMaterial = new SecurityMaterialClient(certificateProvider, tenantId);
      this.apiManagement = new ApiManagementClient(this.mockEngine, tenantId);
      this.alertNotification = new AlertNotificationClient(
        options.real.alertNotification !== undefined
          ? new RealAlertProvider(httpClient, options.real.alertNotification)
          : new MockAlertProvider(this.mockEngine),
        tenantId,
      );
      this.designTime = new DesignTimeClient(this.mockEngine, tenantId);
      this.splunk = new SplunkClient(new MockSplunkProvider(this.mockEngine), tenantId);
      this.partnerDirectory = new PartnerDirectoryClient(
        new RealPartnerDirectoryProvider(pipeline, httpClient),
        tenantId,
      );
      return;
    }

    this.monitoring = new MonitoringClient(new MockMonitoringProvider(this.mockEngine), tenantId);
    this.runtime = new RuntimeClient(new MockRuntimeProvider(this.mockEngine), tenantId);
    this.jms = new JmsClient(new MockJmsProvider(this.mockEngine), tenantId);
    this.payload = new PayloadClient(new MockPayloadProvider(this.mockEngine), tenantId);
    const certificateProvider = new MockCertificateProvider(this.mockEngine);
    this.certificate = new CertificateClient(certificateProvider, tenantId);
    this.valueMapping = new ValueMappingClient(
      new MockValueMappingProvider(this.mockEngine),
      tenantId,
    );
    this.securityMaterial = new SecurityMaterialClient(certificateProvider, tenantId);
    this.apiManagement = new ApiManagementClient(this.mockEngine, tenantId);
    this.alertNotification = new AlertNotificationClient(
      new MockAlertProvider(this.mockEngine),
      tenantId,
    );
    this.designTime = new DesignTimeClient(this.mockEngine, tenantId);
    this.splunk = new SplunkClient(new MockSplunkProvider(this.mockEngine), tenantId);
    this.partnerDirectory = new PartnerDirectoryClient(
      new MockPartnerDirectoryProvider(),
      tenantId,
    );
  }

  /** @returns whether the SDK is currently serving mock data (`providerMode !== "real"`). */
  public isMockModeEnabled(): boolean {
    return this.providerMode === "mock";
  }
}
