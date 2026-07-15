import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BasicAuthProvider } from "../../../src/sdk/auth/BasicAuthProvider.js";
import { TokenCache } from "../../../src/sdk/auth/TokenCache.js";
import { AuthProviderFactory } from "../../../src/sdk/auth/AuthProviderFactory.js";
import { PrincipalPropagationAuthProvider } from "../../../src/sdk/auth/FutureAuthProviders.js";
import { ConfigurationError } from "../../../src/core/errors/ConfigurationError.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";

const context = { tenantId: "primary", correlationId: "corr-1" };

describe("sdk/auth/BasicAuthProvider", () => {
  it("produces a correctly base64-encoded Basic Authorization header", async () => {
    const provider = new BasicAuthProvider({ username: "alice", password: "s3cret" });
    const headers = await provider.getAuthHeaders(context);
    const expected = `Basic ${Buffer.from("alice:s3cret").toString("base64")}`;
    assert.equal(headers.Authorization, expected);
  });
});

describe("sdk/auth/TokenCache", () => {
  it("returns undefined for an absent key", () => {
    const cache = new TokenCache();
    assert.equal(cache.get("missing"), undefined);
  });

  it("returns a stored token before it nears expiry", () => {
    const cache = new TokenCache(1000);
    cache.set("key", "tok-123", 60000);
    assert.equal(cache.get("key")?.value, "tok-123");
  });

  it("treats a token within the expiry skew window as expired", () => {
    const cache = new TokenCache(5000);
    cache.set("key", "tok-123", 4000);
    assert.equal(cache.get("key"), undefined);
  });

  it("evict removes a single key or clears the whole cache", () => {
    const cache = new TokenCache();
    cache.set("a", "1", 60000);
    cache.set("b", "2", 60000);
    cache.evict("a");
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b")?.value, "2");
    cache.evict();
    assert.equal(cache.get("b"), undefined);
  });
});

describe("sdk/auth/AuthProviderFactory", () => {
  const noopHttpClient = {} as IHttpClient;

  it("builds a BasicAuthProvider for type 'basic'", () => {
    const provider = AuthProviderFactory.create(
      { type: "basic", basic: { username: "u", password: "p" } },
      noopHttpClient,
    );
    assert.equal(provider.type, "basic");
  });

  it("throws ConfigurationError when 'basic' is selected without credentials", () => {
    assert.throws(
      () => AuthProviderFactory.create({ type: "basic" }, noopHttpClient),
      ConfigurationError,
    );
  });

  it("builds the documented future providers without throwing at construction time", () => {
    const provider = AuthProviderFactory.create({ type: "principal-propagation" }, noopHttpClient);
    assert.ok(provider instanceof PrincipalPropagationAuthProvider);
  });

  it("future providers reject when actually invoked", async () => {
    const provider = AuthProviderFactory.create({ type: "saml" }, noopHttpClient);
    await assert.rejects(() => provider.getAuthHeaders(context));
  });
});
