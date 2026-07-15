import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CertificateSecurityCenterService } from "../../../src/modules/certificate-security-center/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

function newService(): CertificateSecurityCenterService {
  return new CertificateSecurityCenterService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: [] });
  });
}

describe("modules/certificate-security-center/CertificateSecurityCenterService", () => {
  it("getDashboard composes summary, expiring/expired lists and security materials in one call", async () => {
    const dashboard = await newService().getDashboard();
    assert.equal(typeof dashboard.summary.totalCertificates, "number");
    assert.ok(Array.isArray(dashboard.expiringSoon));
    assert.ok(Array.isArray(dashboard.expired));
    assert.equal(dashboard.securityMaterials.length, 5);
  });

  it("listCertificates/getCertificate/getTimeline compose coherently for a real mock-mode certificate", async () => {
    const service = newService();
    const certificates = await service.listCertificates();
    const alias = certificates[0]?.alias;
    assert.ok(alias !== undefined);

    const certificate = await service.getCertificate(alias);
    assert.equal(certificate?.alias, alias);

    const timeline = await service.getTimeline(alias);
    assert.ok((timeline?.length ?? 0) >= 1);
  });

  it("getCertificate/getTimeline return undefined for an unknown alias", async () => {
    const service = newService();
    assert.equal(await service.getCertificate("does-not-exist"), undefined);
    assert.equal(await service.getTimeline("does-not-exist"), undefined);
  });

  it("flagForRenewal appends a flaggedForRenewal event for a real mock-mode certificate", async () => {
    const service = newService();
    const certificates = await service.listCertificates();
    const alias = certificates[0]?.alias;
    assert.ok(alias !== undefined);

    const event = await service.flagForRenewal(alias, "alice");
    assert.equal(event?.kind, "flaggedForRenewal");
    assert.equal(event?.actor, "alice");

    const timeline = await service.getTimeline(alias);
    assert.ok(timeline?.some((e) => e.kind === "flaggedForRenewal"));
  });

  it("listSecurityMaterials always returns 5 categories with only keystore available", async () => {
    const materials = await newService().listSecurityMaterials();
    assert.equal(materials.length, 5);
    assert.equal(materials.filter((m) => m.available).length, 1);
  });
});
