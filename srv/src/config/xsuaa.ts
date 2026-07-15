/**
 * Resolves the bound XSUAA service configuration from the Cloud Foundry environment.
 *
 * Reads `VCAP_SERVICES` defensively (it is absent in local runs) and exposes the `xsappname`, which
 * is needed to translate fully-qualified scopes (`<xsappname>.JmsQueue.Purge`) into the short scope
 * names the application reasons about (`JmsQueue.Purge`).
 */

interface XsuaaCredentials {
  readonly xsappname: string;
  readonly clientid?: string;
  readonly url?: string;
}

interface VcapService {
  readonly credentials?: XsuaaCredentials;
}

function readXsuaaCredentials(): XsuaaCredentials | undefined {
  const raw = process.env.VCAP_SERVICES;
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, VcapService[]>;
    const binding = parsed.xsuaa?.[0];
    return binding?.credentials;
  } catch {
    return undefined;
  }
}

const credentials = readXsuaaCredentials();

/** The bound application name used to prefix scopes, with sensible local fallback. */
export const xsappname: string =
  credentials?.xsappname ?? process.env.XSAPPNAME ?? "integration-portal";

/**
 * Strips the `<xsappname>.` prefix from a fully-qualified scope, yielding the short scope name.
 * @param scope the fully-qualified scope (e.g. `integration-portal!t1.JmsQueue.Purge`).
 * @returns the short scope name (e.g. `JmsQueue.Purge`), or the input unchanged if no prefix.
 */
export function toShortScope(scope: string): string {
  const prefix = `${xsappname}.`;
  return scope.startsWith(prefix) ? scope.slice(prefix.length) : scope;
}
