/** Barrel for the SDK's destination framework. */
export type {
  DeploymentEnvironment,
  DestinationDefinition,
  DestinationResolveOptions,
  TenantDestinationBinding,
} from "./DestinationTypes.js";
export type { IDestinationDiscoveryProvider } from "./IDestinationDiscoveryProvider.js";
export { StaticDestinationDiscoveryProvider } from "./StaticDestinationDiscoveryProvider.js";
export {
  BtpDestinationDiscoveryProvider,
  type BtpDestinationServiceConfig,
} from "./BtpDestinationDiscoveryProvider.js";
export type { IDestinationResolver } from "./IDestinationResolver.js";
export { DestinationResolver } from "./DestinationResolver.js";
