import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BtpDestinationDiscoveryProvider } from "../../../src/sdk/destination/BtpDestinationDiscoveryProvider.js";
import { DestinationResolver } from "../../../src/sdk/destination/DestinationResolver.js";
import type { TenantDestinationBinding } from "../../../src/sdk/destination/DestinationTypes.js";
import type { IHttpClient } from "../../../src/sdk/http/IHttpClient.js";
import type { HttpRequestOptions, HttpResponse } from "../../../src/sdk/http/HttpTypes.js";

function jsonResponse(body: unknown): HttpResponse {
  return {
    status: 200,
    ok: true,
    headers: new Map(),
    bodyText: JSON.stringify(body),
    attempts: 1,
    durationMs: 1,
  };
}

const serviceOAuthConfig = {
  tokenUrl: "https://dest.example.test/oauth/token",
  clientId: "svc-client",
  clientSecret: "svc-secret",
};

function bindingFor(overrides: Partial<TenantDestinationBinding> = {}): TenantDestinationBinding {
  return {
    tenantId: "primary",
    destinationName: "D1",
    environment: "development",
    fallbackBaseUrl: "https://fallback.example.test",
    default: true,
    ...overrides,
  };
}

describe("sdk/destination/BtpDestinationDiscoveryProvider", () => {
  it("authenticates to the Destination service and maps a BasicAuthentication destination", async () => {
    const calls: HttpRequestOptions[] = [];
    const httpClient: IHttpClient = {
      execute: (options) => {
        calls.push(options);
        if (options.url.includes("/oauth/token")) {
          return Promise.resolve(
            jsonResponse({ access_token: "svc-token", token_type: "bearer", expires_in: 3600 }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            destinationConfiguration: {
              Name: "D1",
              URL: "https://tenant.example.test/api/v1",
              Authentication: "BasicAuthentication",
              User: "u1",
              Password: "p1",
            },
          }),
        );
      },
    };
    const provider = new BtpDestinationDiscoveryProvider(
      { apiUrl: "https://dest.example.test" },
      serviceOAuthConfig,
      [bindingFor()],
      httpClient,
    );
    const definitions = await provider.listDestinations();
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0]?.baseUrl, "https://tenant.example.test/api/v1");
    assert.deepEqual(definitions[0]?.authConfig, {
      type: "basic",
      basic: { username: "u1", password: "p1" },
    });
    assert.ok(calls.some((call) => call.url.includes("/oauth/token")));
  });

  it("maps an OAuth2ClientCredentials destination", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.url.includes("/oauth/token")) {
          return Promise.resolve(
            jsonResponse({ access_token: "t", token_type: "bearer", expires_in: 3600 }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            destinationConfiguration: {
              Name: "D2",
              URL: "https://tenant2.example.test",
              Authentication: "OAuth2ClientCredentials",
              clientId: "cid",
              clientSecret: "csecret",
              tokenServiceURL: "https://tenant2.example.test/oauth/token",
            },
          }),
        );
      },
    };
    const provider = new BtpDestinationDiscoveryProvider(
      { apiUrl: "https://dest.example.test" },
      serviceOAuthConfig,
      [bindingFor({ tenantId: "t2", destinationName: "D2", environment: "production" })],
      httpClient,
    );
    const [definition] = await provider.listDestinations();
    assert.deepEqual(definition?.authConfig, {
      type: "oauth-client-credentials",
      oauthClientCredentials: {
        tokenUrl: "https://tenant2.example.test/oauth/token",
        clientId: "cid",
        clientSecret: "csecret",
        scope: undefined,
      },
    });
  });

  it("throws a typed error for an unsupported Authentication type", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.url.includes("/oauth/token")) {
          return Promise.resolve(
            jsonResponse({ access_token: "t", token_type: "bearer", expires_in: 3600 }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            destinationConfiguration: { Name: "D3", Authentication: "NoAuthentication" },
          }),
        );
      },
    };
    const provider = new BtpDestinationDiscoveryProvider(
      { apiUrl: "https://dest.example.test" },
      serviceOAuthConfig,
      [bindingFor({ tenantId: "t3", destinationName: "D3", environment: "testing" })],
      httpClient,
    );
    await assert.rejects(() => provider.listDestinations());
  });

  it("wires into DestinationResolver through the same seam StaticDestinationDiscoveryProvider uses", async () => {
    const httpClient: IHttpClient = {
      execute: (options) => {
        if (options.url.includes("/oauth/token")) {
          return Promise.resolve(
            jsonResponse({ access_token: "t", token_type: "bearer", expires_in: 3600 }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            destinationConfiguration: {
              Name: "D1",
              URL: "https://tenant.example.test",
              Authentication: "BasicAuthentication",
              User: "u",
              Password: "p",
            },
          }),
        );
      },
    };
    const discovery = new BtpDestinationDiscoveryProvider(
      { apiUrl: "https://dest.example.test" },
      serviceOAuthConfig,
      [bindingFor()],
      httpClient,
    );
    const resolver = new DestinationResolver(discovery, httpClient);
    const tenant = await resolver.resolve({ correlationId: "corr-1" });
    assert.equal(tenant.baseUrl, "https://tenant.example.test");
    assert.ok(tenant.headers.Authorization?.startsWith("Basic "));
  });
});
