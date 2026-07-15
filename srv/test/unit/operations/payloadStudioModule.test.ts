import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PayloadStudioService } from "../../../src/modules/payload-studio/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";

function newService(): PayloadStudioService {
  return new PayloadStudioService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    });
    return new OperationsEngine({ sdk, queueConfigs: [] });
  });
}

function newServiceWithOverrides(
  scenarioOverrides: Record<string, "success" | "empty">,
): PayloadStudioService {
  return new PayloadStudioService(() => {
    const sdk = new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success", scenarioOverrides },
    });
    return new OperationsEngine({ sdk, queueConfigs: [] });
  });
}

async function firstMessageId(service: PayloadStudioService): Promise<string> {
  const engine = new OperationsEngine({
    sdk: new IntegrationSuiteSdkClient({
      defaultTenantId: "primary",
      mockEngineConfig: { enabled: true, defaultScenario: "success" },
    }),
    queueConfigs: [],
  });
  const page = await engine.message.queryMessages({
    page: 1,
    pageSize: 1,
    sortDirection: "desc",
    includePayload: false,
    includeAttachments: false,
    includeHeaders: false,
  });
  const messageId = page.items[0]?.messageId;
  assert.ok(messageId !== undefined, "at least one mock message must exist");
  void service;
  return messageId;
}

describe("modules/payload-studio/PayloadStudioService.getStudio", () => {
  it("composes metadata, request payload, attachments and headers for a known message", async () => {
    const service = newService();
    const messageId = await firstMessageId(service);

    const studio = await service.getStudio(messageId);
    assert.ok(studio !== undefined);
    assert.equal(studio?.metadata.messageId, messageId);
    assert.equal(typeof studio?.metadata.tenantId, "string");
    assert.equal(typeof studio?.metadata.environment, "string");
    assert.equal(studio?.metadata.compression, "none");
    assert.equal(studio?.metadata.payloadSource, "mpl");
    assert.ok(["retryable", "escalated", "not-applicable"].includes(studio!.metadata.retryStatus));

    assert.ok(
      studio?.requestPayload !== undefined,
      "mock fixtures always record a request payload",
    );
    assert.equal(studio?.requestPayload?.format, "xml");
    assert.ok(
      studio?.requestPayload?.formatted.includes("\n"),
      "XML request payload is pretty-printed",
    );

    // Mock mode always generates exactly one attachment per message — an honest, documented seam,
    // not a bug: responsePayload must be undefined rather than fabricated.
    assert.equal(studio?.responsePayload, undefined);

    assert.equal(studio?.attachments.length, 1);
    assert.deepEqual(studio?.headers, studio?.properties, "properties reuse the same headers bag");
  });

  it("returns undefined for an unknown message id", async () => {
    const studio = await newService().getStudio("does-not-exist");
    assert.equal(studio, undefined);
  });

  it("extracts a declared charset from the content type, defaulting to UTF-8", async () => {
    const service = newService();
    const messageId = await firstMessageId(service);
    const studio = await service.getStudio(messageId);
    // The mock fixture's contentType ("application/xml") declares no charset.
    assert.equal(studio?.metadata.encoding, "UTF-8");
    assert.equal(studio?.metadata.characterSet, "UTF-8");
  });
});

describe("modules/payload-studio/PayloadStudioService.getStudio — Splunk fallback", () => {
  it("recovers a decoded request payload from Splunk when the message has no MPL attachments", async () => {
    const service = newServiceWithOverrides({ "payload.listAttachments": "empty" });
    const messageId = await firstMessageId(service);

    const studio = await service.getStudio(messageId);
    assert.ok(studio !== undefined);
    assert.equal(studio?.metadata.payloadSource, "splunk");
    assert.equal(studio?.metadata.compression, "gzip");
    assert.equal(studio?.attachments.length, 0);

    assert.ok(
      studio?.requestPayload !== undefined,
      "Splunk fixture always records a request payload",
    );
    assert.equal(studio?.requestPayload?.format, "xml");
    assert.ok(
      studio?.requestPayload?.formatted.includes("\n"),
      "decoded XML request payload is pretty-printed",
    );
    assert.ok(
      studio?.responsePayload !== undefined,
      "Splunk fixture always records a response payload",
    );
    assert.equal(studio?.responsePayload?.format, "json");
  });

  it("honestly reports the payload as unavailable when neither MPL nor Splunk has anything", async () => {
    const service = newServiceWithOverrides({
      "payload.listAttachments": "empty",
      "splunk.getMessageEvent": "empty",
    });
    const messageId = await firstMessageId(service);

    const studio = await service.getStudio(messageId);
    assert.ok(studio !== undefined);
    assert.equal(studio?.metadata.payloadSource, "unavailable");
    assert.equal(studio?.metadata.compression, "none");
    assert.equal(studio?.requestPayload, undefined);
    assert.equal(studio?.responsePayload, undefined);
  });
});

describe("modules/payload-studio/PayloadStudioService.downloadAttachment", () => {
  it("prepares a download model for a known attachment", async () => {
    const service = newService();
    const messageId = await firstMessageId(service);
    const studio = await service.getStudio(messageId);
    const attachmentId = studio?.attachments[0]?.attachmentId;
    assert.ok(attachmentId !== undefined);

    const download = await service.downloadAttachment(messageId, attachmentId);
    assert.ok(download !== undefined);
    assert.equal(download?.fileName, "request-payload.xml");
    assert.ok(download!.contentBase64.length > 0);
  });

  // Note: MockPayloadProvider.getAttachment deliberately falls back to the first generated
  // attachment for any unrecognized id (its own doc comment: generated ids are opaque random hex a
  // caller cannot predict ahead of a listing call), so "unknown attachment id" is not a distinct,
  // testable scenario in mock mode — that fallback is real-provider-observable-only behavior.
});
