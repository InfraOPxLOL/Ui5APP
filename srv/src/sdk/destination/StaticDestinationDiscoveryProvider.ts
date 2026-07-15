import type { IDestinationDiscoveryProvider } from "./IDestinationDiscoveryProvider.js";
import type { DestinationDefinition } from "./DestinationTypes.js";

/**
 * The default {@link IDestinationDiscoveryProvider}: an in-memory, caller-supplied list of
 * destinations. Suitable for configuration-driven destination lists (today's use) and for tests;
 * swap in a different provider (e.g. one backed by a live Destination-service lookup) without
 * touching {@link DestinationResolver}.
 */
export class StaticDestinationDiscoveryProvider implements IDestinationDiscoveryProvider {
  public constructor(private readonly definitions: readonly DestinationDefinition[]) {}

  /** @inheritdoc */
  public listDestinations(): Promise<readonly DestinationDefinition[]> {
    return Promise.resolve(this.definitions);
  }
}
