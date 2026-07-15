/**
 * Top-level barrel for the Integration Suite SDK (architecture: Phase 4). External consumers
 * should generally only need {@link IntegrationSuiteSdkClient} from `sdk/client`; the other
 * sub-barrels (`sdk/http`, `sdk/auth`, `sdk/destination`, `sdk/odata`, `sdk/rest`, `sdk/pipeline`,
 * `sdk/errors`, `sdk/models`, `sdk/dto`, `sdk/mock`) are exposed here for advanced use (building a
 * real provider in a future phase) and for the SDK's own test suite.
 */
export * from "./client/index.js";
export * from "./models/index.js";
export * from "./dto/index.js";
export * as SdkHttp from "./http/index.js";
export * as SdkAuth from "./auth/index.js";
export * as SdkDestination from "./destination/index.js";
export * as SdkOData from "./odata/index.js";
export * as SdkRest from "./rest/index.js";
export * as SdkPipeline from "./pipeline/index.js";
export * as SdkErrors from "./errors/index.js";
export * as SdkMock from "./mock/index.js";
