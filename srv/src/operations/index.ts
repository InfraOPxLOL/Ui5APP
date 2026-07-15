/**
 * Top-level barrel for the Operations Engine (architecture: Phase 6). Any future UI module should
 * only ever import {@link OperationsEngine} from here (plus the DTO/query types it needs); the
 * individual engines, transforms and cache are exposed for the Operations Engine's own test suite
 * and advanced composition, not for routine module use.
 */
export { OperationsEngine, type OperationsEngineOptions } from "./OperationsEngine.js";
export * from "./dto/index.js";
export * from "./models/index.js";
export * as OperationsEngines from "./engines/index.js";
export * as OperationsTransform from "./transform/index.js";
export * as OperationsCacheModule from "./cache/index.js";
