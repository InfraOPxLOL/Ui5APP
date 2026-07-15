import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CertificateSecurityEngine } from "../../../src/operations/engines/CertificateSecurityEngine.js";
import { CertificateSecurityStateStore } from "../../../src/operations/engines/CertificateSecurityStateStore.js";
import { CertificateEngine } from "../../../src/operations/engines/CertificateEngine.js";
import { CertificateClient } from "../../../src/sdk/client/CertificateClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { ICertificateProvider } from "../../../src/core/providers/ICertificateProvider.js";
import type { CertificateInfo } from "../../../src/core/providers/types.js";

const now = Date.now();
const certificates: CertificateInfo[] = [
  {
    alias: "expiring-soon-cert",
    keyType: "RSA 2048",
    owner: "Tenant A",
    issuer: "Tenant A",
    validFrom: new Date(now - 300 * 86_400_000).toISOString(),
    validTo: new Date(now + 5 * 86_400_000).toISOString(),
    serialNumber: "1",
  },
  {
    alias: "expired-weak-cert",
    keyType: "RSA 1024",
    owner: undefined,
    issuer: "DigiCert Global Root CA",
    validFrom: new Date(now - 700 * 86_400_000).toISOString(),
    validTo: new Date(now - 10 * 86_400_000).toISOString(),
    serialNumber: "2",
  },
  {
    alias: "healthy-cert",
    keyType: "EC P-256",
    owner: "Partner B2B Gateway",
    issuer: "GlobalSign Root CA",
    validFrom: new Date(now - 100 * 86_400_000).toISOString(),
    validTo: new Date(now + 400 * 86_400_000).toISOString(),
    serialNumber: "3",
  },
];

const certificateProvider: ICertificateProvider = {
  listCertificates: () => Promise.resolve(certificates),
  listExpiring: (_context, withinDays) => {
    const horizon = now + withinDays * 86_400_000;
    return Promise.resolve(certificates.filter((c) => new Date(c.validTo).getTime() <= horizon));
  },
};

function buildEngine(
  stateStore: CertificateSecurityStateStore = new CertificateSecurityStateStore(),
): CertificateSecurityEngine {
  const cache = new OperationsCache();
  const certificate = new CertificateEngine(
    new CertificateClient(certificateProvider, "primary"),
    cache,
  );
  return new CertificateSecurityEngine(certificate, cache, stateStore);
}

describe("operations/engines/CertificateSecurityEngine", () => {
  describe("listCertificates", () => {
    it("computes selfSigned/weakAlgorithm/riskScore heuristics from real fields only", async () => {
      const engine = buildEngine();
      const details = await engine.listCertificates();

      const expiringSoon = details.find((d) => d.alias === "expiring-soon-cert");
      assert.equal(expiringSoon?.selfSigned, true);
      assert.equal(expiringSoon?.weakAlgorithm, false);
      assert.equal(expiringSoon?.riskScore, 65);

      const expiredWeak = details.find((d) => d.alias === "expired-weak-cert");
      assert.equal(expiredWeak?.selfSigned, undefined);
      assert.equal(expiredWeak?.weakAlgorithm, true);
      assert.equal(expiredWeak?.riskScore, 80);

      const healthy = details.find((d) => d.alias === "healthy-cert");
      assert.equal(healthy?.selfSigned, false);
      assert.equal(healthy?.weakAlgorithm, false);
      assert.equal(healthy?.riskScore, 0);
    });

    it("never fabricates subject/fingerprint/signatureAlgorithm/usage data", async () => {
      const engine = buildEngine();
      const details = await engine.listCertificates();
      for (const detail of details) {
        assert.equal(detail.subject, undefined);
        assert.equal(detail.fingerprint, undefined);
        assert.equal(detail.signatureAlgorithm, undefined);
        assert.deepEqual(detail.usedByIntegrationFlows, []);
        assert.deepEqual(detail.usedByDestinations, []);
      }
    });
  });

  describe("getCertificate", () => {
    it("returns undefined for an unknown alias", async () => {
      const engine = buildEngine();
      assert.equal(await engine.getCertificate("does-not-exist"), undefined);
    });
  });

  describe("getDashboard", () => {
    it("composes summary counts and health score from the certificate population", async () => {
      const engine = buildEngine();
      const dashboard = await engine.getDashboard();
      assert.equal(dashboard.summary.totalCertificates, 3);
      assert.equal(dashboard.summary.expiredCount, 1);
      assert.equal(dashboard.summary.expiringSoonCount, 1);
      assert.equal(dashboard.summary.selfSignedCount, 1);
      assert.equal(dashboard.summary.weakAlgorithmCount, 1);
      assert.ok(dashboard.summary.healthScore < 100);
      assert.equal(dashboard.expired.length, 1);
      assert.equal(dashboard.expiringSoon.length, 1);
    });

    it("marks only keystore as available among security materials", async () => {
      const engine = buildEngine();
      const dashboard = await engine.getDashboard();
      const keystore = dashboard.securityMaterials.find((m) => m.category === "keystore");
      const oauth = dashboard.securityMaterials.find((m) => m.category === "oauthCredential");
      assert.equal(keystore?.available, true);
      assert.equal(keystore?.count, 3);
      assert.equal(oauth?.available, false);
      assert.ok(oauth?.reason !== undefined && oauth.reason.length > 0);
    });
  });

  describe("listSecurityMaterials", () => {
    it("lists exactly 5 categories with only keystore available", async () => {
      const engine = buildEngine();
      const materials = await engine.listSecurityMaterials();
      assert.equal(materials.length, 5);
      assert.equal(materials.filter((m) => m.available).length, 1);
    });
  });

  describe("getTimeline / flagForRenewal", () => {
    it("seeds imported/expiry milestones from the certificate's real dates on first access", async () => {
      const engine = buildEngine();
      const timeline = await engine.getTimeline("expiring-soon-cert");
      assert.equal(timeline?.length, 2);
      assert.equal(timeline?.[0]?.kind, "imported");
      assert.equal(timeline?.[1]?.kind, "expiring");
    });

    it("seeds an 'expired' milestone (not 'expiring') for an already-expired certificate", async () => {
      const engine = buildEngine();
      const timeline = await engine.getTimeline("expired-weak-cert");
      assert.equal(timeline?.[1]?.kind, "expired");
    });

    it("returns undefined for an unknown alias", async () => {
      const engine = buildEngine();
      assert.equal(await engine.getTimeline("does-not-exist"), undefined);
    });

    it("flagForRenewal appends a flaggedForRenewal event visible in the timeline", async () => {
      const stateStore = new CertificateSecurityStateStore();
      const engine = buildEngine(stateStore);
      const event = await engine.flagForRenewal("healthy-cert", "alice");
      assert.equal(event?.kind, "flaggedForRenewal");
      assert.equal(event?.actor, "alice");
      const timeline = await engine.getTimeline("healthy-cert");
      assert.equal(timeline?.length, 3);
      assert.equal(timeline?.[2]?.kind, "flaggedForRenewal");
    });

    it("flagForRenewal returns undefined for an unknown alias", async () => {
      const engine = buildEngine();
      assert.equal(await engine.flagForRenewal("does-not-exist", "alice"), undefined);
    });
  });
});
