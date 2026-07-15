import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applicationSchema,
  environmentSchema,
  tenantsSchema,
  queuesSchema,
  refreshSchema,
  featuresSchema,
  themeSchema,
  monitoringSchema,
  loggingSchema,
  securitySchema,
  connectivitySchema,
} from "../../src/config/schemas/index.js";

/**
 * Regression tests binding the shipped `config/` files to their schemas: every domain file in the
 * repository must validate against its zod schema, so a config edit that would fail the boot
 * fail-fast is caught by `npm test` first. Pure schema modules only — no env/ConfigService import.
 */

const schemas = {
  application: applicationSchema,
  environment: environmentSchema,
  tenants: tenantsSchema,
  queues: queuesSchema,
  refresh: refreshSchema,
  features: featuresSchema,
  theme: themeSchema,
  monitoring: monitoringSchema,
  logging: loggingSchema,
  security: securitySchema,
  connectivity: connectivitySchema,
} as const;

function loadConfigFile(name: string): unknown {
  // Tests run with cwd = srv/; the config directory lives at the repo root.
  const path = resolve(process.cwd(), "..", "config", `${name}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("config/ files validate against their schemas", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name}.json is valid`, () => {
      const result = schema.safeParse(loadConfigFile(name));
      assert.ok(
        result.success,
        result.success ? undefined : `validation issues: ${JSON.stringify(result.error?.issues)}`,
      );
    });
  }
});

describe("schema guardrails reject invalid configuration", () => {
  it("rejects tenants with duplicate ids", () => {
    const tenant = {
      id: "t1",
      name: "T1",
      destinationName: "D1",
      baseUrl: "https://example.com",
      region: "eu10",
      environment: "dev",
      displayColor: "#0070F2",
      displayIcon: "sap-icon://cloud",
      refreshProfile: "standard",
      default: true,
      enabled: true,
      description: "",
    };
    const result = tenantsSchema.safeParse({ tenants: [tenant, { ...tenant, default: false }] });
    assert.equal(result.success, false);
  });

  it("rejects a manual-retry queue with maxRetries > 0", () => {
    const result = queuesSchema.safeParse({
      queues: [
        {
          name: "Q",
          displayName: "Q",
          description: "",
          deadLetterQueue: "Q.DLQ",
          retryQueue: "Q.RETRY",
          priority: 1,
          enabled: true,
          retryStrategy: "manual",
          maxRetries: 3,
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects a refresh defaultProfile that is not declared", () => {
    const result = refreshSchema.safeParse({
      defaultProfile: "missing",
      profiles: { standard: { dashboardMs: 30000 } },
    });
    assert.equal(result.success, false);
  });

  it("rejects a connectivity tenantAuth entry missing oauthTokenUrl for oauth-client-credentials", () => {
    const result = connectivitySchema.safeParse({
      mode: "real",
      destinationDiscovery: "static",
      tenantAuth: [{ tenantId: "primary", type: "oauth-client-credentials" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate connectivity tenantAuth entries for the same tenant", () => {
    const entry = { tenantId: "primary", type: "basic" as const };
    const result = connectivitySchema.safeParse({
      mode: "real",
      destinationDiscovery: "static",
      tenantAuth: [entry, entry],
    });
    assert.equal(result.success, false);
  });

  it("rejects a default theme that is not in availableThemes", () => {
    const result = themeSchema.safeParse({
      defaultTheme: "sap_horizon",
      darkTheme: "sap_horizon_dark",
      availableThemes: ["sap_horizon_dark"],
      allowUserOverride: true,
      compactMode: "auto",
      accentColor: "#0070F2",
      logo: "",
      companyName: "X",
      applicationTitle: "X",
    });
    assert.equal(result.success, false);
  });
});
