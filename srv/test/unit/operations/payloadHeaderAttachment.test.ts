import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PayloadEngine } from "../../../src/operations/engines/PayloadEngine.js";
import { HeaderEngine } from "../../../src/operations/engines/HeaderEngine.js";
import { AttachmentEngine } from "../../../src/operations/engines/AttachmentEngine.js";
import { PayloadClient } from "../../../src/sdk/client/PayloadClient.js";
import { SplunkClient } from "../../../src/sdk/client/SplunkClient.js";
import { MockSplunkProvider } from "../../../src/sdk/providers/MockSplunkProvider.js";
import { MockEngine } from "../../../src/sdk/mock/MockEngine.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { IPayloadProvider } from "../../../src/core/providers/IPayloadProvider.js";
import type { PayloadEnvelope } from "../../../src/core/providers/types.js";

function newSplunkClient(): SplunkClient {
  const mockEngine = new MockEngine({ enabled: true, defaultScenario: "success" });
  return new SplunkClient(new MockSplunkProvider(mockEngine), "primary");
}

const XML_ENVELOPE: PayloadEnvelope = {
  messageId: "m1",
  attachmentId: "a1",
  name: "payload.xml",
  contentType: "application/xml",
  sizeBytes: 42,
  content: "<Order><Id>1</Id></Order>",
};

const JSON_ENVELOPE: PayloadEnvelope = {
  messageId: "m1",
  attachmentId: "a2",
  name: "payload.json",
  contentType: "application/json",
  sizeBytes: 20,
  content: '{"id":1,"status":"OK"}',
};

function providerFor(envelope: PayloadEnvelope): IPayloadProvider {
  return {
    listAttachments: (_context, messageId) =>
      Promise.resolve([
        {
          messageId,
          attachmentId: envelope.attachmentId,
          name: envelope.name,
          contentType: envelope.contentType,
          sizeBytes: envelope.sizeBytes,
        },
      ]),
    getAttachment: (_context, _messageId, attachmentId) =>
      Promise.resolve(attachmentId === envelope.attachmentId ? envelope : undefined),
  };
}

describe("operations/engines/PayloadEngine", () => {
  it("detects XML, pretty-prints it, and leaves tree undefined", async () => {
    const engine = new PayloadEngine(
      new PayloadClient(providerFor(XML_ENVELOPE), "primary"),
      newSplunkClient(),
      new OperationsCache(),
    );
    const summary = await engine.preparePayload("m1", "a1");
    assert.equal(summary?.format, "xml");
    assert.equal(summary?.raw, XML_ENVELOPE.content);
    assert.ok(summary?.formatted.includes("\n"));
    assert.equal(summary?.tree, undefined);
  });

  it("detects JSON, pretty-prints it, and produces a parsed tree", async () => {
    const engine = new PayloadEngine(
      new PayloadClient(providerFor(JSON_ENVELOPE), "primary"),
      newSplunkClient(),
      new OperationsCache(),
    );
    const summary = await engine.preparePayload("m1", "a2");
    assert.equal(summary?.format, "json");
    assert.equal(summary?.formatted, JSON.stringify({ id: 1, status: "OK" }, null, 2));
    assert.deepEqual(summary?.tree, { id: 1, status: "OK" });
  });

  it("returns undefined for an unknown attachment", async () => {
    const engine = new PayloadEngine(
      new PayloadClient(providerFor(XML_ENVELOPE), "primary"),
      newSplunkClient(),
      new OperationsCache(),
    );
    assert.equal(await engine.preparePayload("m1", "missing"), undefined);
  });

  it("toDownloadModel base64-encodes text content for download", async () => {
    const engine = new PayloadEngine(
      new PayloadClient(providerFor(XML_ENVELOPE), "primary"),
      newSplunkClient(),
      new OperationsCache(),
    );
    const model = await engine.toDownloadModel("m1", "a1");
    assert.equal(model?.fileName, "payload.xml");
    assert.equal(
      Buffer.from(model?.contentBase64 ?? "", "base64").toString("utf8"),
      XML_ENVELOPE.content,
    );
  });
});

describe("operations/engines/HeaderEngine", () => {
  const engine = new HeaderEngine();
  const headers = { SAP_Sender: "S4", SAP_Receiver: "Ariba", CustomFlag: "true" };

  it("categorizes SAP-standard vs custom headers", () => {
    const summary = engine.categorize(headers);
    assert.equal(summary.sapStandard.length, 2);
    assert.equal(summary.custom.length, 1);
    assert.equal(summary.all.length, 3);
  });

  it("search matches by name or value substring, case-insensitively", () => {
    assert.equal(engine.search(headers, "sender").length, 1);
    assert.equal(engine.search(headers, "ariba").length, 1);
    assert.equal(engine.search(headers, "nomatch").length, 0);
  });
});

describe("operations/engines/AttachmentEngine", () => {
  it("lists attachment metadata with a humanized size", async () => {
    const engine = new AttachmentEngine(
      new PayloadClient(providerFor(XML_ENVELOPE), "primary"),
      new OperationsCache(),
    );
    const attachments = await engine.listAttachments("m1");
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.sizeHuman, "42 B");
  });
});
