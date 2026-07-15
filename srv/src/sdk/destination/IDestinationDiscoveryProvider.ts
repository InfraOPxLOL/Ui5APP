import type { DestinationDefinition } from "./DestinationTypes.js";

/**
 * Supplies the set of known destinations to a {@link DestinationResolver}. Separated from the
 * resolver itself so *how* destinations are discovered can evolve independently of *how* they are
 * resolved and authenticated (architecture: Destination Framework, §3 — "Future destination
 * discovery"). {@link StaticDestinationDiscoveryProvider} is the implementation used today; a
 * future provider backed by the BTP Destination service's own lookup API can implement this same
 * interface without the resolver changing at all.
 */
export interface IDestinationDiscoveryProvider {
  /**
   * @returns every known destination definition.
   */
  listDestinations(): Promise<readonly DestinationDefinition[]>;
}
