import type { FrameworkConfig } from "../../config/schemas/index.js";
import type { FrameworkDetection } from "../dto/FrameworkDto.js";
import type { RecoveryStrategy } from "./RecoveryStrategy.js";
import { TpmV2RecoveryStrategy } from "./strategies/TpmV2RecoveryStrategy.js";
import { JmsFrameworkRecoveryStrategy } from "./strategies/JmsFrameworkRecoveryStrategy.js";
import { CommonIdocRouterRecoveryStrategy } from "./strategies/CommonIdocRouterRecoveryStrategy.js";
import { IdocStatusSyncRecoveryStrategy } from "./strategies/IdocStatusSyncRecoveryStrategy.js";
import { ManualRecoveryStrategy } from "./strategies/ManualRecoveryStrategy.js";

/**
 * Builds one strategy instance per configured framework and picks the right one for a detection
 * result (Phase 13, §2).
 *
 * This is the seam that keeps framework knowledge **out of** `RecoveryEngine`: the engine asks the
 * resolver for a strategy and calls `resolve`/`execute` on whatever comes back, so it contains no
 * `if (framework === …)` chain and never needs editing when a framework is added.
 *
 * Only frameworks that are both **enabled** and actually present in `config/frameworks.json` get a
 * strategy — a framework removed from configuration simply stops being resolvable, and its messages
 * fall through to {@link ManualRecoveryStrategy}, which is always registered last and always matches.
 *
 * Strategies are stateless with respect to individual messages (per-message values travel on the
 * located result, not on `this`), so a single instance safely serves the many concurrent
 * resolutions a bulk recovery plan performs.
 */
export class RecoveryStrategyResolver {
  private readonly strategies: readonly RecoveryStrategy[];
  private readonly fallback: RecoveryStrategy = new ManualRecoveryStrategy();

  public constructor(frameworks: readonly FrameworkConfig[]) {
    const enabled = frameworks.filter((framework) => framework.enabled);
    this.strategies = enabled
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((config) => RecoveryStrategyResolver.build(config))
      .filter((strategy): strategy is RecoveryStrategy => strategy !== undefined);
  }

  /**
   * Picks the strategy handling a detection result.
   * @param detection the framework detection result.
   * @returns the matching strategy, or the manual fallback when none claims it. Never `undefined` —
   *   every message gets an answer.
   */
  public resolve(detection: FrameworkDetection): RecoveryStrategy {
    return (
      this.strategies.find((strategy) => strategy.supports(detection)) ?? this.fallback
    );
  }

  /** The registered per-framework strategies, in resolution order (diagnostics/tests). */
  public listStrategies(): readonly RecoveryStrategy[] {
    return this.strategies;
  }

  /**
   * Maps a configured framework id to its strategy class. The `id` enum is closed by
   * `frameworks.schema.ts`, so this switch is exhaustive by construction — adding a framework to
   * that enum surfaces here as a compile error rather than a silent unhandled case.
   */
  private static build(config: FrameworkConfig): RecoveryStrategy | undefined {
    switch (config.id) {
      case "TPM_V2":
        return new TpmV2RecoveryStrategy(config);
      case "JMS_FRAMEWORK":
        return new JmsFrameworkRecoveryStrategy(config);
      case "COMMON_IDOC_ROUTER":
        return new CommonIdocRouterRecoveryStrategy(config);
      case "IDOC_STATUS_SYNC":
        return new IdocStatusSyncRecoveryStrategy(config);
    }
  }
}
