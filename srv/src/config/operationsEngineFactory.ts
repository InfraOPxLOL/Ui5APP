import { configService } from "./ConfigService.js";
import { env } from "./env.js";
import { createIntegrationSuiteSdkClient } from "./sdkClientFactory.js";
import { OperationsEngine } from "../operations/OperationsEngine.js";
import type { MockEngineConfig } from "../sdk/mock/index.js";

/**
 * Builds the {@link OperationsEngine} from this application's own configuration — the composition
 * root that wires `ConfigService.getQueues()` (queue topology metadata),
 * `ConfigService.getFrameworks()` (the processing-framework registry backing framework detection and
 * the recovery strategies), `env.jmsQueueDiscoveryMode`
 * (`JMS_QUEUE_DISCOVERY_MODE`) and the already-existing
 * {@link createIntegrationSuiteSdkClient} (mock- or real-mode SDK client, per `connectivity.json`)
 * into one `OperationsEngine`. Mirrors `sdkClientFactory.ts`'s own role one layer up: the Operations
 * Engine itself never reads `config/*.json` (see `OperationsEngine`'s doc comment), keeping it the
 * same kind of portable, dependency-injected "enterprise framework" the SDK is.
 *
 * Not called anywhere yet — no module consumes the Operations Engine in this phase (Phase 6 builds
 * business logic only, no UI/route wiring). A future phase's module services call this once per
 * request (or once at startup, per the desired request-scoped caching lifetime — see
 * `OperationsEngine`'s own doc comment on why a fresh instance per operation is the intended usage).
 * @param mockEngineConfig configuration for the shared `MockEngine` the underlying SDK client uses.
 * @returns a fully composed `OperationsEngine`.
 */
export function createOperationsEngine(mockEngineConfig: MockEngineConfig): OperationsEngine {
  const sdk = createIntegrationSuiteSdkClient(mockEngineConfig);
  const queueConfigs = configService.getQueues();
  const frameworkConfigs = configService.getFrameworks();
  return new OperationsEngine({
    sdk,
    queueConfigs,
    frameworkConfigs,
    queueDiscoveryMode: env.jmsQueueDiscoveryMode,
  });
}
