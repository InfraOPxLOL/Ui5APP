import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { apiRouter } from "../../../src/routes/index.js";

/**
 * Deployed, the approuter answers `X-CSRF-Token: Fetch` itself, strips the header before forwarding
 * the request, and copies every backend response header over its own response. If this endpoint
 * set a token anyway it would replace the approuter's, and every POST would then be refused with
 * 403 — exactly the "every retry says Session expired" failure seen on the deployed portal.
 */
describe("routes GET /csrf-token", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use("/api/v1", apiRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  after(() => {
    server.close();
  });

  it("issues a token when asked directly (local run, no approuter in front)", async () => {
    const response = await fetch(`${base}/csrf-token`, { headers: { "X-CSRF-Token": "Fetch" } });
    assert.equal(response.status, 204);
    assert.ok((response.headers.get("x-csrf-token") ?? "").length > 0);
  });

  it("stays silent behind the approuter, which strips the fetch header and owns the token", async () => {
    const response = await fetch(`${base}/csrf-token`);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("x-csrf-token"), null);
  });
});
