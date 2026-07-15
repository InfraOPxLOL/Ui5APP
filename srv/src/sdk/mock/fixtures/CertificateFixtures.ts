import type { CertificateInfo } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

const ALIASES = [
  "partner-signing-cert",
  "sap-cloud-platform-clientcert",
  "sftp-partner-key",
  "oauth-client-cert",
  "b2b-gateway-cert",
];
const ISSUERS = ["DigiCert Global Root CA", "SAP Trust Community", "GlobalSign Root CA"];

/**
 * Generates a deterministic list of realistic {@link CertificateInfo} entries for the mock engine's
 * `CertificateProvider` implementation. A configurable fraction expire soon, so the expiry-sweep
 * scenario has something to find.
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated certificates.
 */
export function generateCertificates(count: number, seed = 42): CertificateInfo[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const expiringSoon = rng.chance(0.2);
    const validTo = new Date(
      now + (expiringSoon ? rng.int(1, 25) : rng.int(60, 730)) * 86400000,
    ).toISOString();
    return {
      alias: `${ALIASES[index % ALIASES.length]}-${index}`,
      keyType: rng.pick(["RSA 2048", "RSA 4096", "EC P-256"]),
      owner: rng.pick(["Integration Suite Tenant", "Partner B2B Gateway", undefined]),
      issuer: rng.pick(ISSUERS),
      validFrom: new Date(now - rng.int(30, 700) * 86400000).toISOString(),
      validTo,
      serialNumber: (seed * 1000 + index).toString(16).toUpperCase(),
    };
  });
}
