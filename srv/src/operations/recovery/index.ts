/**
 * Barrel for the framework-aware recovery layer (Phase 13, §2). Import
 * {@link module:./RecoveryStrategyResolver.RecoveryStrategyResolver} for normal use — individual
 * strategies are only referenced directly by the resolver and by tests.
 */
export type { RecoveryStrategy, RecoveryContext } from "./RecoveryStrategy.js";
export {
  QueueRecoveryStrategyBase,
  type LocatedMessage,
} from "./QueueRecoveryStrategyBase.js";
export { RecoveryStrategyResolver } from "./RecoveryStrategyResolver.js";
export {
  RecoveryLockStore,
  recoveryLockStore,
  type LockAcquisition,
} from "./RecoveryLockStore.js";
export { TpmV2RecoveryStrategy } from "./strategies/TpmV2RecoveryStrategy.js";
export { JmsFrameworkRecoveryStrategy } from "./strategies/JmsFrameworkRecoveryStrategy.js";
export { CommonIdocRouterRecoveryStrategy } from "./strategies/CommonIdocRouterRecoveryStrategy.js";
export { IdocStatusSyncRecoveryStrategy } from "./strategies/IdocStatusSyncRecoveryStrategy.js";
export { ManualRecoveryStrategy } from "./strategies/ManualRecoveryStrategy.js";
