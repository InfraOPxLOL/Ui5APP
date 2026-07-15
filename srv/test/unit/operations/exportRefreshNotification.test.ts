import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExportEngine } from "../../../src/operations/engines/ExportEngine.js";
import { RefreshEngine } from "../../../src/operations/engines/RefreshEngine.js";
import { NotificationEngine } from "../../../src/operations/engines/NotificationEngine.js";
import { AlertNotificationClient } from "../../../src/sdk/client/AlertNotificationClient.js";
import { OperationsCache } from "../../../src/operations/cache/index.js";
import type { IAlertProvider } from "../../../src/core/providers/IAlertProvider.js";
import type { AlertEvent } from "../../../src/core/providers/types.js";

describe("operations/engines/ExportEngine", () => {
  const rows = [
    { id: 1, name: "a,b", note: 'has "quotes"' },
    { id: 2, name: "plain", note: "ok" },
  ];

  it("toCsv quotes values containing commas/quotes", () => {
    const model = ExportEngine.toCsv(rows);
    assert.equal(model.format, "csv");
    assert.ok(model.content.includes('"a,b"'));
    assert.ok(model.content.includes('"has ""quotes"""'));
  });

  it("toJson renders pretty-printed JSON", () => {
    const model = ExportEngine.toJson(rows);
    assert.deepEqual(JSON.parse(model.content), rows);
  });

  it("toXml escapes special characters and wraps each row", () => {
    const model = ExportEngine.toXml(rows);
    assert.ok(model.content.startsWith("<?xml"));
    assert.ok(model.content.includes("<name>a,b</name>"));
  });

  it("toExcel renders a SpreadsheetML workbook Excel can open natively", () => {
    const model = ExportEngine.toExcel(rows);
    assert.equal(model.mimeType, "application/vnd.ms-excel");
    assert.ok(model.content.includes("urn:schemas-microsoft-com:office:spreadsheet"));
    assert.ok(model.content.includes('<Cell><Data ss:Type="String">plain</Data></Cell>'));
  });

  it("toPdf rejects with a typed ServiceError (documented future format)", async () => {
    await assert.rejects(
      () => ExportEngine.toPdf(),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "SERVICE_ERROR");
        return true;
      },
    );
  });

  it("handles an empty row set without throwing", () => {
    assert.equal(ExportEngine.toCsv([]).content, "");
    assert.doesNotThrow(() => ExportEngine.toExcel([]));
  });
});

describe("operations/engines/RefreshEngine", () => {
  it("refreshNow runs the callback immediately", async () => {
    const engine = new RefreshEngine();
    let called = false;
    await engine.refreshNow(async () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("subscribe/unsubscribe track active subscriptions", () => {
    const engine = new RefreshEngine();
    engine.subscribe("key1", 100_000, () => Promise.resolve());
    assert.equal(engine.isSubscribed("key1"), true);
    engine.unsubscribe("key1");
    assert.equal(engine.isSubscribed("key1"), false);
  });

  it("subscribing twice under the same key replaces the previous subscription", () => {
    const engine = new RefreshEngine();
    engine.subscribe("key1", 100_000, () => Promise.resolve());
    engine.subscribe("key1", 200_000, () => Promise.resolve());
    assert.equal(engine.isSubscribed("key1"), true);
    engine.cancelAll();
    assert.equal(engine.isSubscribed("key1"), false);
  });

  it("cancelAll stops every active subscription", () => {
    const engine = new RefreshEngine();
    engine.subscribe("a", 100_000, () => Promise.resolve());
    engine.subscribe("b", 100_000, () => Promise.resolve());
    engine.cancelAll();
    assert.equal(engine.isSubscribed("a"), false);
    assert.equal(engine.isSubscribed("b"), false);
  });
});

describe("operations/engines/NotificationEngine", () => {
  const alerts: AlertEvent[] = [
    {
      alertId: "al1",
      severity: "CRITICAL",
      title: "Down",
      description: "d",
      source: "ANS",
      raisedAt: "2024-01-01T00:00:00.000Z",
      tags: [],
    },
    {
      alertId: "al2",
      severity: "LOW",
      title: "Info",
      description: "d",
      source: "ANS",
      raisedAt: "2024-01-01T00:00:00.000Z",
      tags: [],
    },
  ];
  const provider: IAlertProvider = {
    queryAlerts: (_context, page) =>
      Promise.resolve({
        items: alerts.slice(page.skip, page.skip + page.top),
        total: alerts.length,
      }),
    getAlert: (_context, alertId) => Promise.resolve(alerts.find((a) => a.alertId === alertId)),
  };

  it("listNotifications maps severity into the normalized vocabulary", async () => {
    const engine = new NotificationEngine(
      new AlertNotificationClient(provider, "primary"),
      new OperationsCache(),
    );
    const result = await engine.listNotifications({ skip: 0, top: 10 });
    assert.equal(result.total, 2);
    assert.equal(result.items.find((n) => n.notificationId === "al1")?.severity, "critical");
    assert.equal(result.items.find((n) => n.notificationId === "al2")?.severity, "info");
  });

  it("getNotification returns undefined for an unknown id", async () => {
    const engine = new NotificationEngine(
      new AlertNotificationClient(provider, "primary"),
      new OperationsCache(),
    );
    assert.equal(await engine.getNotification("missing"), undefined);
  });
});
