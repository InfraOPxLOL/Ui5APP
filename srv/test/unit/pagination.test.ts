import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyPage } from "../../src/core/http/pagination.js";

/**
 * Unit tests for the shared pagination helper. Reference pattern for backend unit tests: import a
 * pure module (nothing that loads config/env at import time) and assert behaviour.
 */
describe("core/http/pagination", () => {
  it("emptyPage returns a valid empty envelope with the default page size", () => {
    const page = emptyPage<{ id: string }>();
    assert.deepEqual(page.items, []);
    assert.equal(page.total, 0);
    assert.equal(page.skip, 0);
    assert.equal(page.top, 50);
  });

  it("emptyPage echoes a provided page size", () => {
    const page = emptyPage<number>(200);
    assert.equal(page.top, 200);
    assert.equal(page.items.length, 0);
  });
});
