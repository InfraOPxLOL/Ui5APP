/**
 * The business-friendly view of one Partner Directory string parameter, as returned by
 * {@link PartnerDirectoryEngine}. A straight pass-through of the neutral provider domain type today
 * (no enrichment needed), given its own DTO so module services never import an SDK/core type.
 */
export interface PartnerDirectoryParameterDto {
  readonly pid: string;
  readonly id: string;
  readonly value: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/**
 * The business-friendly view of one Partner Directory binary parameter, as returned by
 * {@link PartnerDirectoryEngine}. A straight pass-through of the neutral provider domain type (no
 * enrichment needed) — the value stays base64-encoded here too; decoding is a module concern.
 */
export interface PartnerDirectoryBinaryParameterDto {
  readonly pid: string;
  readonly id: string;
  readonly contentType: string;
  readonly valueBase64: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}
