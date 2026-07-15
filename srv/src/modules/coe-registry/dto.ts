/**
 * DTOs for the Global Partner Parameter Registry (spec §2, Tile 3 — "View / Search / Edit Active
 * Rulesets"). A PID-scoped view/edit/delete surface over Partner Directory string parameters,
 * composed entirely from the Operations Engine's Partner Directory engine.
 */

/** One registry row — a Partner Directory string parameter with its audit fields. */
export interface RegistryParameterDto {
  readonly pid: string;
  readonly id: string;
  readonly value: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** The parameters under one Partner ID. */
export interface RegistryListDto {
  readonly pid: string;
  readonly parameters: readonly RegistryParameterDto[];
}

/** The edit payload for `PUT /api/v1/coe-registry`. */
export interface RegistryUpdate {
  readonly pid: string;
  readonly id: string;
  readonly value: string;
}
