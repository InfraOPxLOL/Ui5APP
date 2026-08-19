import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applicationSchema,
  environmentSchema,
  tenantsSchema,
  queuesSchema,
  frameworksSchema,
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
  frameworks: frameworksSchema,
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

  it("rejects duplicate framework ids", () => {
    const framework = { id: "TPM_V2", label: "TPM V2", priority: 1 };
    const result = frameworksSchema.safeParse({
      frameworks: [framework, { ...framework, priority: 2 }],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate framework priorities, which would make detection order ambiguous", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        { id: "TPM_V2", label: "TPM V2", priority: 1 },
        { id: "JMS_FRAMEWORK", label: "JMS", priority: 1 },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects a dead-letter queue with no recovery mapping", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        {
          id: "TPM_V2",
          label: "TPM V2",
          priority: 1,
          topology: {
            traversalOrder: ["MAIN_Q", "MAIN_Q_DLQ"],
            activeQueues: ["MAIN_Q"],
            deadLetterQueues: ["MAIN_Q_DLQ"],
            dlqRecoveryMap: {},
          },
        },
      ],
    });
    assert.equal(
      result.success,
      false,
      "a parked message would have nowhere to be moved back to",
    );
  });

  it("rejects a dlqRecoveryMap target that is not an active queue", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        {
          id: "TPM_V2",
          label: "TPM V2",
          priority: 1,
          topology: {
            traversalOrder: ["MAIN_Q", "MAIN_Q_DLQ"],
            activeQueues: ["MAIN_Q"],
            deadLetterQueues: ["MAIN_Q_DLQ"],
            dlqRecoveryMap: { MAIN_Q_DLQ: "SOME_OTHER_Q" },
          },
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects a traversalOrder entry that is neither an active nor a dead-letter queue", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        {
          id: "TPM_V2",
          label: "TPM V2",
          priority: 1,
          topology: {
            traversalOrder: ["MAIN_Q", "TYPO_Q"],
            activeQueues: ["MAIN_Q"],
            deadLetterQueues: [],
            dlqRecoveryMap: {},
          },
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects a detection pattern that is not a compilable regular expression", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        {
          id: "TPM_V2",
          label: "TPM V2",
          priority: 1,
          detect: { integrationFlowPatterns: ["^SAP_TPM_(unclosed"] },
        },
      ],
    });
    assert.equal(
      result.success,
      false,
      "an invalid regex must fail at boot, not at the first message it is applied to",
    );
  });

  it("accepts a framework with no detection rules at all (queue-evidence-only detection)", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [
        {
          id: "COMMON_IDOC_ROUTER",
          label: "Common IDoc Router",
          priority: 1,
          topology: {
            traversalOrder: ["Common_Router_JMS", "Common_Router_JMS_DLQ"],
            activeQueues: ["Common_Router_JMS"],
            deadLetterQueues: ["Common_Router_JMS_DLQ"],
            dlqRecoveryMap: { Common_Router_JMS_DLQ: "Common_Router_JMS" },
          },
        },
      ],
    });
    assert.equal(result.success, true);
  });

  it("rejects a framework id outside the configurable set", () => {
    const result = frameworksSchema.safeParse({
      frameworks: [{ id: "UNKNOWN", label: "Unknown", priority: 1 }],
    });
    assert.equal(
      result.success,
      false,
      "UNKNOWN/NON_FRAMEWORK are detection outcomes, not configurable frameworks",
    );
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
