import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FetchHttpClient } from "../../../src/sdk/http/FetchHttpClient.js";
import { createOperationContext } from "../../../src/sdk/models/OperationContext.js";
import { createRequestContext } from "../../../src/sdk/models/RequestContext.js";

const originalFetch = globalThis.fetch;

function fakeResponse(status: number, body = "{}"): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

function newContext() {
  return createOperationContext(
    createRequestContext("primary", { correlationId: "corr-1" }),
    "test.op",
  );
}

describe("sdk/http/FetchHttpClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the response on a successful first attempt", async () => {
    globalThis.fetch = (async () => fakeResponse(200, '{"ok":true}')) as typeof fetch;
    const client = new FetchHttpClient();
    const response = await client.execute(
      { method: "GET", url: "https://example.test/api" },
      newContext(),
    );
    assert.equal(response.status, 200);
    assert.equal(response.attempts, 1);
    assert.equal(response.bodyText, '{"ok":true}');
  });

  it("retries a retryable status and succeeds on a later attempt", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls < 3 ? fakeResponse(503) : fakeResponse(200, "{}");
    }) as typeof fetch;

    const client = new FetchHttpClient({
      defaultRetryPolicy: {
        maxAttempts: 5,
        baseDelayMs: 1,
        backoffFactor: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [503],
        retryOnNetworkError: true,
      },
    });
    const response = await client.execute(
      { method: "GET", url: "https://example.test/api" },
      newContext(),
    );
    assert.equal(response.status, 200);
    assert.equal(response.attempts, 3);
    assert.equal(calls, 3);
  });

  it("gives up after maxAttempts and returns the last failing response", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return fakeResponse(500);
    }) as typeof fetch;

    const client = new FetchHttpClient({
      defaultRetryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 1,
        backoffFactor: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [500],
        retryOnNetworkError: true,
      },
    });
    const response = await client.execute(
      { method: "GET", url: "https://example.test/api" },
      newContext(),
    );
    assert.equal(response.ok, false);
    assert.equal(response.attempts, 2);
    assert.equal(calls, 2);
  });

  it("does not retry a non-retryable status", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return fakeResponse(404);
    }) as typeof fetch;

    const client = new FetchHttpClient();
    const response = await client.execute(
      { method: "GET", url: "https://example.test/api" },
      newContext(),
    );
    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  });

  it("classifies an exceeded timeout as a transport failure and throws", async () => {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch;

    const client = new FetchHttpClient({
      defaultRetryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 1,
        backoffFactor: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [],
        retryOnNetworkError: false,
      },
    });
    await assert.rejects(
      () =>
        client.execute(
          { method: "GET", url: "https://example.test/api", timeoutMs: 20 },
          newContext(),
        ),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "TIMEOUT");
        return true;
      },
    );
  });
});
