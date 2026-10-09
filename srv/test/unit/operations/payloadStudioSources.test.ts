import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PayloadStudioService } from "../../../src/modules/payload-studio/service.js";
import { OperationsEngine } from "../../../src/operations/OperationsEngine.js";
import { IntegrationSuiteSdkClient } from "../../../src/sdk/client/IntegrationSuiteSdkClient.js";
import type { MockEngineConfig } from "../../../src/sdk/mock/MockTypes.js";
import {
  MOCK_TPM_PROCESSING_DLQ,
  TPM_DLQ_SCENARIOS,
  resetMockMoves,
} from "../../../src/sdk/mock/fixtures/index.js";

function newService(overrides: MockEngineConfig["scenarioOverrides"] = {}): PayloadStudioService {
  return new PayloadStudioService(
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

const scenario = TPM_DLQ_SCENARIOS.find(
  (candidate) =>
    candidate.mplId.startsWith("tpm-dlq-") && candidate.queueName === MOCK_TPM_PROCESSING_DLQ,
);
if (scenario === undefined) {
  throw new Error("fixture: no tpm-dlq processing scenario");
}

beforeEach(() => {
  resetMockMoves();
});

describe("modules/payload-studio payload sources", () => {
  it("keeps an MPL's own attachment as the payload when it has one", async () => {
    const studio = await newService().getStudio("msg-a410");
    assert.equal(studio?.metadata.payloadSource, "mpl");
    assert.ok(studio?.requestPayload !== undefined);
  });

  it("shows the B2B interchange's received and sent documents when the MPL logged no attachment", async () => {
    const studio = await newService().getStudio(scenario.mplId);

    assert.equal(studio?.metadata.payloadSource, "b2b");
    assert.equal(studio?.attachments.length, 0);
    assert.match(studio?.requestPayload?.raw ?? "", new RegExp(scenario.controlNumber));
    assert.equal(studio?.requestPayload?.format, "text", "EDI is text, not binary");
    assert.ok(studio?.responsePayload !== undefined, "the sent document is the response payload");
  });

  it("falls back to Splunk when the tenant has no B2B Monitor", async () => {
    const studio = await newService({ "b2b.findInterchangeByMplId": "error" }).getStudio(
      scenario.mplId,
    );
    assert.notEqual(studio?.metadata.payloadSource, "b2b");
  });

  it("shows the JMS message's broker body when a queued message is named", async () => {
    const studio = await newService().getStudio(scenario.mplId, {
      jms: { queueName: scenario.queueName, messageId: scenario.jmsMessageId },
    });
    assert.equal(studio?.metadata.payloadSource, "jms");
    assert.equal(studio?.requestPayload?.name, "jms-message");
    assert.match(studio?.requestPayload?.raw ?? "", /^ISA|^UNA|^UNB|^</);
  });

  it("opens a queued message that has no processing log from its JMS properties alone", async () => {
    const studio = await newService().getStudio("no-such-mpl", {
      jms: { queueName: scenario.queueName, messageId: scenario.jmsMessageId },
    });
    assert.equal(studio?.metadata.messageId, scenario.jmsMessageId);
    assert.equal(studio?.metadata.payloadSource, "jms");
    assert.equal(studio?.metadata.correlationId, scenario.correlationId);
  });

  it("shows a named interchange's documents even when the MPL has its own attachment", async () => {
    const studio = await newService().getStudio("msg-a410", {
      interchangeId: scenario.interchangeId,
    });
    assert.equal(studio?.metadata.payloadSource, "b2b");
    assert.match(studio?.requestPayload?.raw ?? "", new RegExp(scenario.controlNumber));
    assert.ok((studio?.attachments.length ?? 0) > 0, "the MPL's attachments stay listed");
  });

  it("still reports an unknown message as not found", async () => {
    assert.equal(await newService().getStudio("no-such-mpl"), undefined);
  });
});
