/**
 * Unit tests for signing out through the approuter: token fetch, POST, the redirect it returns, and
 * local development without an approuter.
 */
sap.ui.define(
  ["com/middlewareops/integrationportal/core/services/auth/LogoutService"],
  function (LogoutService) {
    "use strict";

    QUnit.module("core/services/auth/LogoutService");

    /** A fake fetch answering the GET (token) and POST (logout) calls, recording them. */
    function fakeFetch(options) {
      var calls = [];
      var fn = function (url, init) {
        calls.push({ url: url, method: init.method, token: init.headers["X-CSRF-Token"] });
        if (options.fail) {
          return Promise.reject(new Error("network"));
        }
        if (init.method === "GET") {
          return Promise.resolve({
            ok: options.token !== undefined,
            headers: {
              get: function (name) {
                return name === "X-CSRF-Token" && options.token !== undefined
                  ? options.token
                  : null;
              },
            },
          });
        }
        return Promise.resolve({
          ok: options.postOk !== false,
          text: function () {
            return Promise.resolve(options.body || "");
          },
        });
      };
      fn.calls = calls;
      return fn;
    }

    QUnit.test(
      "fetches a token, posts it, and follows the URL the approuter returns",
      function (assert) {
        var done = assert.async();
        var fetch = fakeFetch({
          token: "tok-1",
          body: "https://sub.authentication.eu10.hana.ondemand.com/logout.do?redirect=x",
        });
        new LogoutService(fetch).logout().then(function (result) {
          assert.deepEqual(result, {
            kind: "redirect",
            url: "https://sub.authentication.eu10.hana.ondemand.com/logout.do?redirect=x",
          });
          assert.deepEqual(
            fetch.calls.map(function (call) {
              return call.method + " " + call.url + " " + call.token;
            }),
            ["GET /logout Fetch", "POST /logout tok-1"],
          );
          done();
        });
      },
    );

    QUnit.test("without an approuter there is no session to end", function (assert) {
      var done = assert.async(2);
      new LogoutService(fakeFetch({})).logout().then(function (result) {
        assert.strictEqual(result.kind, "unavailable", "no token offered (local dev server)");
        done();
      });
      new LogoutService(fakeFetch({ fail: true })).logout().then(function (result) {
        assert.strictEqual(result.kind, "unavailable", "network error");
        done();
      });
    });

    QUnit.test("a refused logout is reported, not followed", function (assert) {
      var done = assert.async();
      new LogoutService(fakeFetch({ token: "tok", postOk: false }))
        .logout()
        .then(function (result) {
          assert.strictEqual(result.kind, "unavailable");
          done();
        });
    });

    QUnit.test("only safe redirect targets are followed", function (assert) {
      assert.strictEqual(LogoutService.safeUrl("/logged-out.html"), "/logged-out.html");
      assert.strictEqual(
        LogoutService.safeUrl("https://x.example/logout"),
        "https://x.example/logout",
      );
      assert.strictEqual(LogoutService.safeUrl("//evil.example"), "/logged-out.html");
      assert.strictEqual(LogoutService.safeUrl("javascript:alert(1)"), "/logged-out.html");
      assert.strictEqual(LogoutService.safeUrl(""), "/logged-out.html");
    });
  },
);
