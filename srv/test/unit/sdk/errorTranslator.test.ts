import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpErrorTranslator } from "../../../src/sdk/errors/HttpErrorTranslator.js";
import { AuthenticationError, AuthorizationError } from "../../../src/core/errors/AuthErrors.js";
import { HttpError } from "../../../src/core/errors/HttpError.js";
import { RateLimitError } from "../../../src/sdk/errors/RateLimitError.js";
import { TimeoutError } from "../../../src/sdk/errors/TimeoutError.js";
import { IntegrationSuiteError } from "../../../src/core/errors/IntegrationSuiteError.js";

describe("sdk/errors/HttpErrorTranslator", () => {
  const translate = (status: number, rawBody?: unknown) =>
    HttpErrorTranslator.translate("primary", {
      httpStatus: status,
      message: `status ${status}`,
      rawBody,
    });

  it("maps 401 to AuthenticationError", () => {
    assert.ok(translate(401) instanceof AuthenticationError);
  });

  it("maps 403 to AuthorizationError", () => {
    assert.ok(translate(403) instanceof AuthorizationError);
  });

  it("maps 404 to HttpError with code NOT_FOUND", () => {
    const error = translate(404);
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.statusCode, 404);
  });

  it("maps 409 to HttpError with code CONFLICT", () => {
    const error = translate(409);
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "CONFLICT");
    assert.equal(error.statusCode, 409);
  });

  it("maps 429 to RateLimitError, extracting retryAfterSeconds when present", () => {
    const error = translate(429, { retryAfterSeconds: 30 });
    assert.ok(error instanceof RateLimitError);
    assert.equal(error.retryAfterMs, 30000);
  });

  it("maps 500/502/503 to IntegrationSuiteError, tagged with the tenant id", () => {
    for (const status of [500, 502, 503]) {
      const error = translate(status);
      assert.ok(error instanceof IntegrationSuiteError);
      assert.equal(error.tenantId, "primary");
      assert.equal(error.upstreamStatus, status);
    }
  });

  it("maps 504 to TimeoutError", () => {
    assert.ok(translate(504) instanceof TimeoutError);
  });

  it("falls back to IntegrationSuiteError for unmapped statuses", () => {
    assert.ok(translate(418) instanceof IntegrationSuiteError);
  });

  it("translateTransportFailure distinguishes timeout from network failure", () => {
    const timeout = HttpErrorTranslator.translateTransportFailure("timeout", 5000);
    const network = HttpErrorTranslator.translateTransportFailure(
      "network",
      new Error("ECONNREFUSED"),
    );
    assert.ok(timeout instanceof TimeoutError);
    assert.equal((timeout as TimeoutError).timeoutMs, 5000);
    assert.equal(network.code, "NETWORK_ERROR");
  });
});
