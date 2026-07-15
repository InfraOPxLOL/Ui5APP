/** One property declared on an OData entity type. */
export interface ODataEntityProperty {
  readonly name: string;
  /** The EDM type as declared in metadata (e.g. `Edm.String`, `Edm.DateTime`). */
  readonly type: string;
  readonly nullable: boolean;
}

/** One entity type declared in an OData `$metadata` (EDMX) document. */
export interface ODataEntityType {
  readonly name: string;
  readonly properties: readonly ODataEntityProperty[];
}

const ENTITY_TYPE_PATTERN = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
const PROPERTY_PATTERN =
  /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"(?:\s+Nullable="([^"]+)")?[^/]*\/>/g;

/**
 * Extracts entity type and property declarations from an OData `$metadata` (EDMX/CSDL) XML
 * document (architecture: OData Framework, §5 — "Metadata parsing").
 *
 * This is a focused, dependency-free extractor for the subset of EDMX the SDK needs (entity type
 * names and their scalar properties) — not a general-purpose XML/CSDL parser. It intentionally
 * avoids adding an XML parsing dependency to the backend for a capability whose only consumer
 * today is diagnostic/schema-discovery tooling; a full CSDL parser is a documented option if a
 * future provider needs associations, complex types, or function imports.
 */
export class ODataMetadataParser {
  /**
   * Parses every entity type declared in a `$metadata` document.
   * @param metadataXml the raw EDMX XML text.
   * @returns the declared entity types, in document order.
   */
  public static parse(metadataXml: string): readonly ODataEntityType[] {
    const entityTypes: ODataEntityType[] = [];
    for (const entityMatch of metadataXml.matchAll(ENTITY_TYPE_PATTERN)) {
      const [, name, body] = entityMatch;
      if (name === undefined || body === undefined) {
        continue;
      }
      entityTypes.push({ name, properties: ODataMetadataParser.parseProperties(body) });
    }
    return entityTypes;
  }

  /**
   * Finds one entity type by name.
   * @param metadataXml the raw EDMX XML text.
   * @param entityTypeName the entity type name to find.
   * @returns the matching entity type, or `undefined` when not declared.
   */
  public static findEntityType(
    metadataXml: string,
    entityTypeName: string,
  ): ODataEntityType | undefined {
    return ODataMetadataParser.parse(metadataXml).find((type) => type.name === entityTypeName);
  }

  private static parseProperties(entityBody: string): readonly ODataEntityProperty[] {
    const properties: ODataEntityProperty[] = [];
    for (const propertyMatch of entityBody.matchAll(PROPERTY_PATTERN)) {
      const [, name, type, nullable] = propertyMatch;
      if (name === undefined || type === undefined) {
        continue;
      }
      properties.push({ name, type, nullable: nullable !== "false" });
    }
    return properties;
  }
}
