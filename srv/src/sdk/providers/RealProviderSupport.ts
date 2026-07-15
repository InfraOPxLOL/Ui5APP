/**
 * Shared helpers for the `Real*Provider` implementations (architecture: Provider Framework, §10 —
 * live Integration Suite providers). Kept here rather than duplicated per provider: OData v2 date
 * parsing is needed by {@link RealMonitoringProvider}, {@link RealRuntimeProvider} and
 * {@link RealCertificateProvider} alike.
 */

const ODATA_V2_DATE_PATTERN = /^\/Date\((-?\d+)\)\/$/;

/**
 * Normalizes an OData v2 `Edm.DateTime` value into an ISO 8601 string. SAP Integration Suite's v2
 * OData APIs serialize dates as `/Date(<epoch-ms>)/`; this also accepts an already-ISO string
 * unchanged, so callers don't need to know which shape a given tenant/API version returns.
 * @param value the raw date value from an upstream OData v2 payload.
 * @returns the ISO 8601 string, or `undefined` when `value` is `undefined`.
 */
export function parseODataV2DateTime(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = ODATA_V2_DATE_PATTERN.exec(value);
  if (match?.[1] === undefined) {
    return value;
  }
  return new Date(Number.parseInt(match[1], 10)).toISOString();
}

/**
 * Encodes a value as an OData v2 key predicate literal (e.g. `'abc'` for a string key).
 * @param key the raw key value.
 * @returns the quoted, escaped literal.
 */
export function toODataV2KeyLiteral(key: string): string {
  return `'${key.replace(/'/g, "''")}'`;
}
