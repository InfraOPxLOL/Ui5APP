import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReportServerService } from "../../../src/modules/report-server/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { B2bEngine } from "../../../src/operations/engines/B2bEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import { UpstreamError } from "../../../src/core/errors/UpstreamError.js";
import type { MockEngineConfig } from "../../../src/sdk/mock/MockTypes.js";
import { TPM_DLQ_SCENARIOS } from "../../../src/sdk/mock/fixtures/index.js";

function newService(overrides: MockEngineConfig["scenarioOverrides"] = {}): ReportServerService {
  return new ReportServerService(
    () =>
      new OperationsEngine({
        sdk: new IntegrationSuiteSdkClient({
          defaultTenantId: "primary",
          mockEngineConfig: {
            enabled: true,
            defaultScenario: "success",
            scenarioOverrides: overrides,
          },
        }),
      }),
  );
}

describe("modules/report-server list and summary", () => {
  it("lists interchanges newest first, paged", async () => {
    const first = await newService().list({ pageSize: 10 });
    assert.equal(first.items.length, 10);
    assert.ok(first.total > 10);
    const starts = first.items.map((row) => row.startedAt ?? "");
    assert.deepEqual(starts, [...starts].sort().reverse());

    const second = await newService().list({ page: 2, pageSize: 10 });
    assert.notEqual(second.items[0]?.id, first.items[0]?.id);
  });

  it("filters on status, partner, standard and control number", async () => {
    const failed = await newService().list({ status: "FAILED", pageSize: 500 });
    assert.ok(failed.items.length >= TPM_DLQ_SCENARIOS.length);
    assert.ok(
      failed.items.every((row) => row.overallStatus === "FAILED" && row.statusCategory === "error"),
    );

    const amazon = await newService().list({ senderPartner: "AMAZONJP", pageSize: 500 });
    assert.ok(amazon.items.every((row) => row.sender.tradingPartnerName?.includes("AMAZONJP")));

    const edifact = await newService().list({ documentStandard: "UN-EDIFACT", pageSize: 500 });
    assert.ok(edifact.items.length > 0);
    assert.ok(edifact.items.every((row) => row.sender.documentStandard === "UN-EDIFACT"));

    const byControl = await newService().list({ controlNumber: "000010812" });
    assert.equal(byControl.items[0]?.id, TPM_DLQ_SCENARIOS[0]?.interchangeId);
  });

  it("filters on direction, adapter and agreement", async () => {
    const inbound = await newService().list({ direction: "INBOUND", pageSize: 500 });
    assert.ok(inbound.items.length > 0);
    assert.ok(inbound.items.every((row) => row.direction === "INBOUND"));

    const as2 = await newService().list({ adapterType: "AS2", pageSize: 500 });
    assert.ok(as2.items.length > 0);
    assert.ok(
      as2.items.every(
        (row) => row.sender.adapterType === "AS2" || row.receiver.adapterType === "AS2",
      ),
    );

    const scenario = TPM_DLQ_SCENARIOS[0];
    const byAgreement = await newService().list({
      agreement: scenario?.messageType ?? "",
      pageSize: 500,
    });
    assert.ok(byAgreement.items.some((row) => row.id === scenario?.interchangeId));
  });

  it("finds the interchange a processing log belongs to", async () => {
    const scenario = TPM_DLQ_SCENARIOS.find((s) => s.mplId.startsWith("tpm-dlq-"));
    const result = await newService().list({ mplId: scenario?.mplId });
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.id, scenario?.interchangeId);

    const summary = await newService().summary({ mplId: scenario?.mplId });
    assert.equal(summary.total, 1);
  });

  it("returns nothing for a processing log that belongs to no interchange", async () => {
    const result = await newService().list({ mplId: "msg-not-b2b" });
    assert.equal(result.total, 0);
    assert.equal(result.items.length, 0);
    assert.equal((await newService().summary({ mplId: "msg-not-b2b" })).total, 0);
  });

  it("summarises status counts that add up to the total", async () => {
    const summary = await newService().summary({});
    const sum = summary.counts.reduce((total, entry) => total + entry.count, 0);
    assert.equal(sum, summary.total);
    assert.equal(summary.truncated, false);
    assert.ok(
      summary.counts.some((entry) => entry.status === "FAILED" && entry.category === "error"),
    );
  });
});

describe("modules/report-server detail and payloads", () => {
  it("returns events, payloads, errors and the processing logs those events point at", async () => {
    const scenario = TPM_DLQ_SCENARIOS[0];
    assert.ok(scenario !== undefined);
    const detail = await newService().getById(scenario.interchangeId);
    assert.equal(detail.interchange.overallStatus, "FAILED");
    assert.equal(detail.errors[0]?.errorInformation, scenario.errorText);
    assert.equal(detail.payloads.length, 2);
    assert.equal(detail.linkedProcessingLogs.length, scenario.priorRuns + 1);
    assert.ok(detail.linkedProcessingLogs.some((log) => log.mplId === scenario.mplId));
  });

  it("returns payload content with its rendering format", async () => {
    const scenario = TPM_DLQ_SCENARIOS[0];
    assert.ok(scenario !== undefined);
    const inbound = await newService().getPayload(
      scenario.interchangeId,
      `${scenario.interchangeId}-in`,
    );
    assert.equal(inbound.format, "edi");
    assert.ok(inbound.content.startsWith("ISA*"));
    assert.ok(inbound.sizeBytes > 0);
    const outbound = await newService().getPayload(
      scenario.interchangeId,
      `${scenario.interchangeId}-out`,
    );
    assert.equal(outbound.format, "xml");
  });

  it("answers 404 for an unknown interchange or payload", async () => {
    await assert.rejects(
      () => newService().getById("nope"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
    await assert.rejects(
      () => newService().getPayload("nope", "nope-in"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });

  it("explains a tenant without Trading Partner Management as a 503", async () => {
    const service = new ReportServerService(() => {
      const engine = new OperationsEngine({
        sdk: new IntegrationSuiteSdkClient({
          defaultTenantId: "primary",
          mockEngineConfig: { enabled: true, defaultScenario: "success" },
        }),
      });
      engine.b2b.queryInterchanges = () =>
        Promise.reject(
          new UpstreamError(500, "Upstream request failed", {
            error: { message: { value: "Can't get a DataSource for tenant TenantInfo" } },
          }),
        );
      return engine;
    });
    await assert.rejects(
      () => service.list({}),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 503 &&
        error.code === "B2B_MONITORING_UNAVAILABLE",
    );
  });
});

describe("operations/engines/B2bEngine.categorize", () => {
  it("groups status words by meaning and leaves the unknown alone", () => {
    assert.equal(B2bEngine.categorize("FAILED"), "error");
    assert.equal(B2bEngine.categorize("Completed"), "success");
    assert.equal(B2bEngine.categorize("RETRYING"), "inProgress");
    assert.equal(B2bEngine.categorize("WAITING_FOR_ACK"), "inProgress");
    assert.equal(B2bEngine.categorize("ARCHIVED"), "unknown");
    assert.equal(B2bEngine.categorize(undefined), "unknown");
  });
});

describe("modules/report-server controller", () => {
  it("passes every filter the route validates on to the service", async () => {
    const { toFilterQuery } = await import("../../../src/modules/report-server/controller.js");
    const { listQuerySchema } = await import("../../../src/modules/report-server/validators.js");
    const fields = Object.keys(listQuerySchema.shape).filter(
      (field) => field !== "page" && field !== "pageSize",
    );
    const query = Object.fromEntries(fields.map((field) => [field, `value-${field}`]));
    assert.deepEqual(Object.keys(toFilterQuery(query)).sort(), [...fields].sort());
  });
});
