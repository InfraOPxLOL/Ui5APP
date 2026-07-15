/**
 * Shared, framework-free parsing of an EDI_DC40 IDoc control record for the CoE creation flows.
 * Client-side and **case-preserving** (per spec): extracts the six identifiers and derives the 6-part
 * route key. Kept as a pure module so every flow (JMS Entry, Common Router, …) parses identically.
 */

/** The six IDoc control-record identifiers plus the derived route key. */
export interface ParsedIdoc {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly idoctyp: string;
  readonly sndpor: string;
  readonly rcvpor: string;
  /** The derived 6-part route key `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}` (`*` for missing). */
  readonly routeKey: string;
}

/** Why a control record could not be parsed — maps to a `coeRouter.parse.<reason>` i18n key. */
export type IdocParseError = "empty" | "invalid" | "incomplete";

/** Discriminated result of {@link parseIdocControlRecord}. */
export type IdocParseResult =
  | { readonly ok: true; readonly idoc: ParsedIdoc }
  | { readonly ok: false; readonly error: IdocParseError };

/**
 * Builds the 6-part route key `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}`, using `*`
 * for any identifier absent/unparsable in the control record. Mirrors the backend's `buildRouteKey`.
 */
export function buildRouteKey(idoc: {
  idoctyp: string;
  mestyp: string;
  sndpor: string;
  sndprn: string;
  rcvpor: string;
  rcvprn: string;
}): string {
  const part = (value: string): string => (value.trim() === "" ? "*" : value.trim());
  return `.${part(idoc.idoctyp)}.${part(idoc.mestyp)}.${part(idoc.sndpor)}.${part(idoc.sndprn)}.${part(idoc.rcvpor)}.${part(idoc.rcvprn)}`;
}

/**
 * Parses a pasted EDI_DC40 control-record block. Handles both `IDOCTYP` and the shorter `IDOCTP`
 * tag spelling. SNDPRN, RCVPRN and MESTYP are mandatory; the remaining identifiers default to `*`.
 * @param raw the pasted control-record text.
 * @returns the parsed identifiers + route key, or a failure reason.
 */
export function parseIdocControlRecord(raw: string): IdocParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "empty" };
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { ok: false, error: "invalid" };
  }
  const first = (...tags: readonly string[]): string => {
    for (const tag of tags) {
      const value = doc.getElementsByTagName(tag)[0]?.textContent?.trim();
      if (value !== undefined && value !== "") {
        return value;
      }
    }
    return "";
  };
  const partial = {
    sndprn: first("SNDPRN"),
    rcvprn: first("RCVPRN"),
    mestyp: first("MESTYP"),
    idoctyp: first("IDOCTYP", "IDOCTP"),
    sndpor: first("SNDPOR"),
    rcvpor: first("RCVPOR"),
  };
  if (partial.sndprn === "" || partial.rcvprn === "" || partial.mestyp === "") {
    return { ok: false, error: "incomplete" };
  }
  return { ok: true, idoc: { ...partial, routeKey: buildRouteKey(partial) } };
}
