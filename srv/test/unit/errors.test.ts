import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/core/errors/HttpError.js";
import { UpstreamError } from "../../src/core/errors/UpstreamError.js";

/**
 * Unit tests for the backend error taxonomy — the mapping that the terminal error middleware relies
 * on to produce stable status codes and machine-readable codes.
 */
describe("core/errors/HttpError", () => {
  it("notFound maps to 404 / NOT_FOUND", () => {
    const error = HttpError.notFound();
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.isOperational, true);
  });

  it("validation maps to 422 / VALIDATION_FAILED and preserves details", () => {
    const error = HttpError.validation("bad", [{ field: "x" }]);
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "VALIDATION_FAILED");
    assert.deepEqual(error.details, [{ field: "x" }]);
  });
});

describe("core/errors/UpstreamError", () => {
  it("maps an upstream 5xx to a 502 gateway error", () => {
    const error = UpstreamError.fromResponse(500);
    assert.equal(error.statusCode, 502);
    assert.equal(error.upstreamStatus, 500);
    assert.equal(error.code, "UPSTREAM_ERROR");
  });

  it("passes an upstream 4xx status through", () => {
    const error = UpstreamError.fromResponse(404);
    assert.equal(error.statusCode, 404);
    assert.equal(error.upstreamStatus, 404);
  });
});
