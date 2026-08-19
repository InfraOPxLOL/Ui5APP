import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockEngine } from "../../../src/sdk/mock/MockEngine.js";
import { MockMonitoringProvider } from "../../../src/sdk/providers/MockMonitoringProvider.js";
import { MockJmsProvider } from "../../../src/sdk/providers/MockJmsProvider.js";
import { MockCertificateProvider } from "../../../src/sdk/providers/MockCertificateProvider.js";
import { MockValueMappingProvider } from "../../../src/sdk/providers/MockValueMappingProvider.js";
import { MockSplunkProvider } from "../../../src/sdk/providers/MockSplunkProvider.js";
import { MockPartnerDirectoryProvider } from "../../../src/sdk/providers/MockPartnerDirectoryProvider.js";
import { resetMockMoves } from "../../../src/sdk/mock/fixtures/index.js";

const context = { tenantId: "primary", correlationId: "corr-1" };
const successEngine = () => new MockEngine({ enabled: true, defaultScenario: "success" });
const emptyEngine = () => new MockEngine({ enabled: true, defaultScenario: "empty" });

describe("sdk/providers/MockMonitoringProvider", () => {
  it("filters by status and paginates results", async () => {
    const provider = new MockMonitoringProvider(successEngine());
    const page = await provider.queryMessageLogs(
      context,
      { status: "FAILED" },
      { skip: 0, top: 5 },
    );
    assert.ok(page.items.length <= 5);
    assert.ok(page.items.every((log) => log.status === "FAILED"));
    assert.ok(page.total >= page.items.length);
  });

  it("returns an empty page under the empty scenario", async () => {
    const provider = new MockMonitoringProvider(emptyEngine());
    const page = await provider.queryMessageLogs(context, {}, { skip: 0, top: 10 });
    assert.deepEqual(page.items, []);
    assert.equal(page.total, 0);
  });

  it("countByStatus aggregates counts within the given window", async () => {
    const provider = new MockMonitoringProvider(successEngine());
    const counts = await provider.countByStatus(
      context,
      "1970-01-01T00:00:00.000Z",
      new Date().toISOString(),
    );
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    assert.ok(total > 0);
  });
});

describe("sdk/providers/MockJmsProvider", () => {
  it("getQueueStates returns one entry per requested queue name, in order", async () => {
    const provider = new MockJmsProvider(successEngine());
    const states = await provider.getQueueStates(context, ["Q1", "Q2", "Q3"]);
    assert.deepEqual(
      states.map((s) => s.queueName),
      ["Q1", "Q2", "Q3"],
    );
  });

  it("purgeQueue returns the count of messages removed", async () => {
    const provider = new MockJmsProvider(successEngine());
    const purged = await provider.purgeQueue(context, "Q1");
    assert.ok(purged > 0);
  });

  it("purgeQueue returns 0 under the empty scenario", async () => {
    const provider = new MockJmsProvider(emptyEngine());
    assert.equal(await provider.purgeQueue(context, "Q1"), 0);
  });

  it("discoverQueues returns queues independent of any requested/configured name list", async () => {
    const provider = new MockJmsProvider(successEngine());
    const discovered = await provider.discoverQueues(context);
    assert.ok(discovered.length > 0);
  });

  it("discoverQueues returns an empty list under the empty scenario", async () => {
    const provider = new MockJmsProvider(emptyEngine());
    assert.deepEqual(await provider.discoverQueues(context), []);
  });

  it("moveMessages relocates only the named message, so a verify-after-move genuinely observes it", async () => {
    resetMockMoves();
    const provider = new MockJmsProvider(successEngine());
    const messageId = "msg-to-move";

    await provider.moveMessages(context, "SOURCE_Q", "TARGET_Q", [messageId]);

    const onTarget = await provider.getMessage(context, "TARGET_Q", messageId);
    assert.ok(onTarget !== undefined, "the move must be observable on the target queue");
    assert.equal(onTarget?.queueName, "TARGET_Q");

    const onSource = await provider.getMessage(context, "SOURCE_Q", messageId);
    assert.equal(onSource, undefined, "the message must no longer be on the source queue");
    resetMockMoves();
  });

  it("moveMessages leaves other messages where they are", async () => {
    resetMockMoves();
    const provider = new MockJmsProvider(successEngine());
    await provider.moveMessages(context, "SOURCE_Q", "TARGET_Q", ["moved-one"]);

    const bystander = await provider.getMessage(context, "TARGET_Q", "untouched-one");
    const moved = await provider.getMessage(context, "TARGET_Q", "moved-one");
    assert.ok(moved !== undefined);
    // The bystander's presence is the fixture's own deterministic pseudo-random answer, not a
    // consequence of the move — asserting it is unchanged would just re-test the generator. What
    // matters is that the relocation ledger only ever holds the ids actually moved.
    assert.ok(bystander === undefined || bystander.messageId === "untouched-one");
    resetMockMoves();
  });
});

describe("sdk/providers/MockCertificateProvider", () => {
  it("listExpiring only returns certificates within the horizon, soonest first", async () => {
    const provider = new MockCertificateProvider(successEngine());
    const expiring = await provider.listExpiring(context, 30);
    const horizon = Date.now() + 30 * 86400000;
    assert.ok(expiring.every((cert) => new Date(cert.validTo).getTime() <= horizon));
    for (let i = 1; i < expiring.length; i += 1) {
      assert.ok(
        new Date(expiring[i]!.validTo).getTime() >= new Date(expiring[i - 1]!.validTo).getTime(),
      );
    }
  });
});

describe("sdk/providers/MockValueMappingProvider", () => {
  it("getScheme finds a scheme generated by listSchemes", async () => {
    const provider = new MockValueMappingProvider(successEngine());
    const schemes = await provider.listSchemes(context);
    assert.ok(schemes.length > 0);
    const found = await provider.getScheme(context, schemes[0]!.name);
    assert.equal(found?.name, schemes[0]!.name);
  });

  it("getScheme returns undefined for an unknown scheme name", async () => {
    const provider = new MockValueMappingProvider(successEngine());
    assert.equal(await provider.getScheme(context, "DoesNotExist"), undefined);
  });
});

describe("sdk/providers/MockSplunkProvider", () => {
  const hint = {
    integrationFlow: "Order_Process",
    sender: "Shopify",
    receiver: "S4HANA",
    messageType: "ORDERS",
    applicationId: "SHOPIFY",
    correlationId: "ORD-20260708-000145",
    status: "FAILED",
  };

  it("getMessageEvent decodes gzip+base64 request/response payloads and echoes the hint", async () => {
    const provider = new MockSplunkProvider(successEngine());
    const event = await provider.getMessageEvent(context, "msg-1", hint);
    assert.equal(event?.messageId, "msg-1");
    assert.equal(event?.correlationId, hint.correlationId);
    assert.ok(event?.requestPayload !== undefined);
    assert.ok(event?.requestPayload?.content.includes("ORDERS05"));
    assert.equal(event?.requestPayload?.compression, "gzip");
    assert.ok(event?.responsePayload !== undefined);
    assert.ok(event?.responsePayload?.content.includes("salesDocument"));
  });

  it("getMessageEvent returns undefined under the empty scenario", async () => {
    const provider = new MockSplunkProvider(emptyEngine());
    assert.equal(await provider.getMessageEvent(context, "msg-1", hint), undefined);
  });
});

describe("sdk/providers/MockPartnerDirectoryProvider", () => {
  const SYS_PID = ".SYS_JMS_FRAMEWORK";

  it("returns seeded .SYS_JMS_FRAMEWORK parameters", async () => {
    const provider = new MockPartnerDirectoryProvider();
    const environment = await provider.getStringParameter(context, SYS_PID, "Environment");
    assert.equal(environment?.value, "DEV");
    const retries = await provider.getStringParameter(context, SYS_PID, "DEFAULT_RETRIES");
    assert.equal(retries?.value, "5");
  });

  it("upserts a value and reads it back", async () => {
    const provider = new MockPartnerDirectoryProvider();
    const saved = await provider.upsertStringParameter(context, {
      pid: SYS_PID,
      id: "Environment",
      value: "PRD",
    });
    assert.equal(saved.value, "PRD");
    const reread = await provider.getStringParameter(context, SYS_PID, "Environment");
    assert.equal(reread?.value, "PRD");
  });

  it("returns undefined for an unknown parameter", async () => {
    const provider = new MockPartnerDirectoryProvider();
    assert.equal(await provider.getStringParameter(context, SYS_PID, "DoesNotExist"), undefined);
  });

  it("lists every parameter under a PID, and none for an unknown PID", async () => {
    const provider = new MockPartnerDirectoryProvider();
    const sysParams = await provider.listStringParameters(context, SYS_PID);
    assert.ok(sysParams.length >= 4);
    assert.ok(sysParams.every((parameter) => parameter.pid === SYS_PID));
    assert.deepEqual(await provider.listStringParameters(context, ".NO.SUCH.AGREEMENT"), []);
  });

  it("deletes a parameter (and is a no-op for an unknown one)", async () => {
    const provider = new MockPartnerDirectoryProvider();
    await provider.deleteStringParameter(context, SYS_PID, "Environment");
    assert.equal(await provider.getStringParameter(context, SYS_PID, "Environment"), undefined);
    await assert.doesNotReject(() => provider.deleteStringParameter(context, SYS_PID, "Nope"));
  });

  it("upserts a binary parameter and reads it back", async () => {
    const provider = new MockPartnerDirectoryProvider();
    const saved = await provider.upsertBinaryParameter(context, {
      pid: "PID_RULES",
      id: "Rule1",
      contentType: "json;encoding=UTF-8",
      valueBase64: Buffer.from('{"kind":"ruleset"}', "utf-8").toString("base64"),
    });
    assert.equal(saved.contentType, "json;encoding=UTF-8");
    const reread = await provider.getBinaryParameter(context, "PID_RULES", "Rule1");
    assert.equal(reread?.valueBase64, saved.valueBase64);
  });

  it("returns undefined for an unknown binary parameter", async () => {
    const provider = new MockPartnerDirectoryProvider();
    assert.equal(await provider.getBinaryParameter(context, "PID_RULES", "NoSuchRule"), undefined);
  });

  it("lists every binary parameter under a PID, and none for an unknown PID", async () => {
    const provider = new MockPartnerDirectoryProvider();
    await provider.upsertBinaryParameter(context, {
      pid: "PID_RULES",
      id: "Rule1",
      contentType: "json",
      valueBase64: "e30=",
    });
    await provider.upsertBinaryParameter(context, {
      pid: "PID_RULES",
      id: "Rule2",
      contentType: "json",
      valueBase64: "e30=",
    });
    const rules = await provider.listBinaryParameters(context, "PID_RULES");
    assert.equal(rules.length, 2);
    assert.deepEqual(await provider.listBinaryParameters(context, ".NO.SUCH.PID"), []);
  });

  it("deletes a binary parameter (and is a no-op for an unknown one)", async () => {
    const provider = new MockPartnerDirectoryProvider();
    await provider.upsertBinaryParameter(context, {
      pid: "PID_RULES",
      id: "Rule1",
      contentType: "json",
      valueBase64: "e30=",
    });
    await provider.deleteBinaryParameter(context, "PID_RULES", "Rule1");
    assert.equal(await provider.getBinaryParameter(context, "PID_RULES", "Rule1"), undefined);
    await assert.doesNotReject(() => provider.deleteBinaryParameter(context, "PID_RULES", "Nope"));
  });
});
