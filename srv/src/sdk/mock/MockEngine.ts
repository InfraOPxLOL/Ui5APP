import type { MockEngineConfig, MockScenario } from "./MockTypes.js";
import { TimeoutError } from "../errors/TimeoutError.js";
import { NetworkError } from "../errors/NetworkError.js";
import { IntegrationSuiteError } from "../../core/errors/IntegrationSuiteError.js";
import { getLogger } from "../../core/logging/logger.js";

/** The data-generating callbacks a mock operation supplies to {@link MockEngine.resolve}. */
export interface MockOperationOptions<T> {
  /** Stable key identifying the operation (e.g. `monitoring.queryMessageLogs`); used for scenario overrides and logging. */
  readonly operationKey: string;
  /** Tenant the call targets, for error/log context. */
  readonly tenantId: string;
  /** Produces a normal, realistic result — used by the `success` scenario and as the fallback for others. */
  readonly generateSuccess: () => T;
  /** Produces a valid empty result; defaults to `generateSuccess` when omitted. */
  readonly generateEmpty?: () => T;
  /** Produces a much larger dataset; defaults to `generateSuccess` when omitted (non-list operations have no larger form). */
  readonly generateLarge?: () => T;
}

/**
 * The SDK's mock engine (architecture: Mock Engine, §11).
 *
 * Every mock provider implementation (`sdk/providers/*`) routes its data through
 * {@link MockEngine.resolve} instead of returning fixtures directly, so scenario selection
 * (success/empty/slow/large/multi-page/timeout/error/failure) is centralized and consistent across
 * every domain — a caller can develop against slow, empty, or failing responses for *any* module by
 * changing configuration, with no code change in the provider.
 */
export class MockEngine {
  private readonly logger = getLogger("sdk.mock");

  public constructor(private readonly config: MockEngineConfig) {}

  /** @returns whether mock mode is enabled. */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Resolves one mock operation per the configured scenario.
   * @param options the operation's data generators and identifying key.
   * @returns the generated result (after any configured delay).
   * @throws {TimeoutError | IntegrationSuiteError | NetworkError} for the `timeout`/`error`/`failure` scenarios.
   */
  public async resolve<T>(options: MockOperationOptions<T>): Promise<T> {
    const scenario = this.scenarioFor(options.operationKey);
    this.logger.debug(
      { operation: options.operationKey, tenantId: options.tenantId, scenario },
      "sdk.mock.resolve",
    );

    switch (scenario) {
      case "success":
        return options.generateSuccess();
      case "empty":
        return (options.generateEmpty ?? options.generateSuccess)();
      case "slow":
        await MockEngine.delay(this.config.slowDelayMs ?? 3000);
        return options.generateSuccess();
      case "largePayload":
      case "multiPage":
        return (options.generateLarge ?? options.generateSuccess)();
      case "timeout":
        throw new TimeoutError(
          this.config.slowDelayMs ?? 30000,
          `Mock scenario "timeout" simulated for operation "${options.operationKey}".`,
        );
      case "error":
        throw IntegrationSuiteError.fromCpiResponse(options.tenantId, 500, {
          message: `Mock scenario "error" simulated for operation "${options.operationKey}".`,
        });
      case "failure":
        throw new NetworkError(
          `Mock scenario "failure" simulated for operation "${options.operationKey}".`,
        );
      default: {
        const exhaustive: never = scenario;
        throw new Error(`Unhandled mock scenario: ${String(exhaustive)}`);
      }
    }
  }

  private scenarioFor(operationKey: string): MockScenario {
    return this.config.scenarioOverrides?.[operationKey] ?? this.config.defaultScenario;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
