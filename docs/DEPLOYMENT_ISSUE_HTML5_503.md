# Deployment Issue: Persistent 503 from HTML5 Application Repository

**Status:** ✅ **RESOLVED** (2026-09-07). Root cause was in our own `xs-app.json` / app packaging — **not** a platform failure. See §1a.
**Last updated:** 2026-09-07
**Affected environment:** SAP BTP Trial, subaccount `d0e06a1ftrial`, org `d0e06a1ftrial`, space `dev`, landscape `us10-001` (Cloud Foundry), `us10` (html5-apps-repo services)

---

## 1. Original symptom

The Integration Portal deploys cleanly to Cloud Foundry — both `integration-portal-srv` and `integration-portal-approuter` report `1/1` running, `cf deploy` finishes with no errors, and the UI5 app content is confirmed registered in the HTML5 Application Repository (`cf html5-list` shows it). Despite this, every request to the approuter's URL returned:

```
503 Service Temporarily Unavailable
openresty
```

## 1a. Actual root cause (supersedes the platform-failure conclusion below)

**Two independent app-side bugs, both in our code.** The `html5-apps-repo` service was healthy the whole time.

### Bug 1 — approuter sent a path with no app-name segment (this is the 503)

`html5-apps-repo-rt` resolves *which* application to serve from the **first path segment** of the incoming request. Our `approuter/xs-app.json` had:

```json
"welcomeFile": "/index.html"
```

so the approuter asked the repository runtime for `/index.html` — a path whose first segment is `index.html`, which is not the name of any registered application. The runtime cannot resolve an app, and its openresty front end answers with a bare, bodyless **503**.

The registered application name is `sap.app.id` with the dots removed — `com.middlewareops.integrationportal` → **`commiddlewareopsintegrationportal`** (exactly what `cf html5-list` reports in the `name` column).

**Fix:** prefix the welcome file with the application name (this is the shape SAP's own [`multi-cloud-html5-apps-samples`](https://github.com/SAP-samples/multi-cloud-html5-apps-samples) standalone-approuter sample uses):

```json
"welcomeFile": "/commiddlewareopsintegrationportal/index.html"
```

The existing catch-all route (`^(.*)$` → `service: html5-apps-repo-rt`) then forwards the already-prefixed path unchanged, and the runtime resolves the app. The `/api/*` and `/ws/*` routes are unaffected — the UI5 code calls those with absolute paths (`/api/v1/...`), so they still match at the approuter and never fall through to the repository.

**Proof (run against the live subaccount, using a client-credentials token from a service key on `integration-portal-html5-repo-runtime`):**

```
GET https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/index.html
  -> HTTP/2 503                                  # no app-name segment

GET https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/commiddlewareopsintegrationportal/index.html
  -> HTTP/2 200  (returns our actual index.html) # app-name segment present
```

### Bug 2 — the app zip contained no `xs-app.json` (surfaced once Bug 1 was fixed)

`app/scripts/zip-content.sh` zips `app/dist/`, but `app/webapp/` never had an `xs-app.json`, so none was ever built into `dist/` or uploaded. The repository requires each application's zip to carry both `manifest.json` **and** `xs-app.json` at its root. With Bug 1 fixed, the approuter resolved the app correctly and the failure mode changed to an explicit, much more informative error in `cf logs integration-portal-approuter --recent`:

```
INFO   Application key = commiddlewareopsintegrationportal
ERROR  GET request to /commiddlewareopsintegrationportal/index.html
       completed with status 500 Application does not have xs-app.json
```

**Fix:** added `app/webapp/xs-app.json` (a minimal catch-all that serves the app's own static content from the repository). `ui5 build` copies it into `dist/`, so it lands at the root of `app-content.zip` automatically.

### Bug 3 — UI5 runtime bootstrapped from a relative path (would have shown as a blank page)

`app/webapp/index.html` bootstrapped from `src="resources/sap-ui-core.js"`. That works in local development only because `app/ui5.yaml`'s `fiori-tools-proxy` proxies `/resources` to `https://ui5.sap.com`. Deployed, `resources/` resolves inside the HTML5 repository, which does not host the UI5 runtime — so it would 404 and render a blank page.

**Fix:** bootstrap from the CDN with a pinned version matching `minUI5Version` (`1.120.0`):

```html
src="https://ui5.sap.com/1.120.35/resources/sap-ui-core.js"
```

### Why the original "decisive test" pointed the wrong way

§4.5 and §4.10 below concluded the platform was broken because a direct call to `html5-apps-repo-rt` 503'd, and because a throwaway test app (`com.test.hello`) 503'd identically. **Both of those tests used the same malformed, un-prefixed URL** (`.../index.html`). They reproduced the operator error, not a platform fault. Querying `com.test.hello` at `.../comtesthello/index.html` would have returned 200 as well.

Note also that `x-apphost-cache-status: HIT` is not evidence of a stuck cache serving a stale 503 — it just reports an app-host metadata cache hit, and it appears on successful responses too.

**Lesson for next time:** when a request through the approuter fails, read `cf logs <approuter> --recent` for the line reporting the outbound request's exact URL and status, and then replay that exact URL by hand. The 503 here was the repository correctly rejecting a URL we built wrong, and the "Application key = ..." log line is the signal that resolution finally worked.

### Verification after the fix

```
GET https://d0e06a1ftrial-dev-integration-portal-approuter.cfapps.us10-001.hana.ondemand.com/
  -> 302 Location: /commiddlewareopsintegrationportal/index.html
  -> 200 (unauthenticated requests get the normal XSUAA login-redirect page)
```
Approuter logs show `Application key = commiddlewareopsintegrationportal` and status `200`, with no errors.

---

**Everything from §2 onward is the original investigation record, kept for history. Its §4 conclusion and §7 recommendations (open an SAP incident, recreate the space/subaccount) are superseded by §1a and should NOT be acted on.**

---

## 2. Environment details

| Item | Value |
|---|---|
| Org | `d0e06a1ftrial` |
| Space | `dev` |
| API endpoint | `https://api.cf.us10-001.hana.ondemand.com` (approuter/srv landscape) |
| html5-apps-repo endpoints | `html5-apps-repo-dt.cfapps.us10.hana.ondemand.com` (content/deploy), `html5-apps-repo-rt.cfapps.us10.hana.ondemand.com` (runtime) — note these resolve under plain `us10`, not `us10-001` |
| Approuter URL | `https://d0e06a1ftrial-dev-integration-portal-approuter.cfapps.us10-001.hana.ondemand.com` |
| `integration-portal-html5-repo-host` app-host-id | `1682932d-670a-4660-92a4-c353611272cf` |
| App identifiers seen registered | `commiddlewareopsintegrationportal` (v0.1.0, then v0.1.1); `comtesthello` (v1.0.0, throwaway diagnostic app) |
| Deploy tooling | `mbt` (Cloud MTA Build Tool) + `cf deploy` (multiapps CLI plugin), run from BAS (`/home/user/Ui5APP-1`) |
| CF stack | `cflinuxfs4` (deprecated, but not implicated — see §6) |

---

## 3. Real bugs found and fixed along the way

Before reaching the platform-level blocker, this investigation found and fixed several genuine, independent bugs in the deployment configuration. These fixes are correct and should stay in `mta.yaml` / `manifest.json` regardless of how the platform-level issue resolves.

### 3.1 `config/` directory not packaged into the `srv` module
`config/*.json` lives at the repo root, outside the `srv` module's `path: srv` scope, so it never made it into the deployed droplet, crashing `ConfigService` at boot.

**Fix:** added a build step to `integration-portal-srv`'s `build-parameters.commands` that copies `config/` into the module's own tree before packaging:
```yaml
- 'node -e "require(''fs'').cpSync(''../config'', ''./config'', { recursive: true })"'
```
Used a Node one-liner (not `cp -r`) so it works identically regardless of which shell/OS runs the build. Note: MBT execs each command directly with no shell — inline `&&`/`cd` do not work; a single self-contained command (or an invoked script) is required.

### 3.2 `com.sap.application.content` module tried to build its own content
The original `integration-portal-app-content` module ran its own `npm ci`/`npm run build`. This executed successfully but produced no artifact MBT recognized as the module's deployable content — it silently never made it into the `.mtar`, so `cf deploy` had nothing to push for the UI5 app.

**Fix:** split into two modules — `integration-portal-app` (`type: html5`, builds the UI5 app) and `integration-portal-app-content` (`type: com.sap.application.content`, packages/pushes the built output; builds nothing itself).

### 3.3 "zip must contain a zip file for each HTML5 application"
Even after the split, `cf deploy` rejected the content upload with:
```
Invalid file format. The request body must include a zip file that contains a zip file for each HTML5 application.
```
Root cause, found by comparing against SAP's own [`multi-cloud-html5-apps-samples`](https://github.com/SAP-samples/multi-cloud-html5-apps-samples) reference repo: `build-result: resources.zip` was wrong — the correct value is `build-result: resources` (the **folder** name, matching `target-path: resources/`), not a `.zip` filename. Also, `requires[].artifacts` does not reference a pre-zipped artifact by MBT-assigned name (there isn't one) — it **glob-matches raw files inside the producing module's `build-result` folder** and copies them as-is. Since `ui5 build` produces loose files, not a zip, the html5 app module needed an explicit zip-creation step of its own.

**Fix:**
- `integration-portal-app-content`: `build-result: resources`, `requires[].artifacts: ['*.zip']`.
- `integration-portal-app`: added `sh scripts/zip-content.sh` as a build command (a wrapper script, since MBT's custom builder execs commands directly with no shell — inline `cd dist && zip ...` fails with `exec: "cd": executable file not found in $PATH`). The script (`app/scripts/zip-content.sh`) zips `dist/`'s **contents** (not the folder itself) into `app-content.zip`, so `manifest.json` sits at the zip's own root — required by the HTML5 Application Repository, which otherwise fails with `manifest.json not found` if it's nested under a `dist/` prefix.

### 3.4 "Could not find applications in the request" (progression from 3.3)
Packaging then produced a structurally valid outer/inner zip, but html5-apps-repo-host rejected the upload with `CODE: '1001' — Could not find applications in the request`. Investigated (and ruled out) an artifact-naming theory before confirming via direct build inspection that the real issue was upstream in 3.3's fix sequence — resolved once `build-result: resources` + explicit zip creation were both correct together.

### 3.5 Missing `sap.cloud.service` destination tagging
`mta.yaml` had an unused `integration-portal-destination` service instance with no destinations ever created in it, and `manifest.json` had no `sap.cloud` section. This is required for approuter's dynamic routing to resolve which app to serve via `html5-apps-repo-rt`.

**Fix:** added an `integration-portal-destination-content` module (matching SAP's official pattern) that creates destinations tagging both `integration-portal-html5-repo-host` and `integration-portal-xsuaa` with `sap.cloud.service: integration-portal`; added `"sap.cloud": { "service": "integration-portal" }` to `manifest.json`. **This fix did not resolve the 503** (see §5), but is correct/required configuration regardless.

---

## 4. Diagnostic trail (in order)

1. **Confirmed clean deploy.** `cf deploy` finishes with `Process finished.`, no errors, both apps `1/1` running.
2. **Confirmed content is genuinely registered**, bypassing approuter entirely:
   - `cf html5-list` (via the `html5-plugin` CF CLI plugin) shows the app registered with correct name/version/app-host-id.
   - Direct REST calls to `html5-apps-repo-host`'s content endpoint, using a client-credentials token fetched from the service key, succeed.
3. **Ruled out browser/HTTP caching.** Tested with DevTools "Disable cache" checked, hard refresh, brand-new incognito windows, and a different device — identical 503 every time.
4. **Ruled out approuter itself.** Set `XS_APP_LOG_LEVEL=DEBUG` and `REQUEST_TRACE=true` (`cf set-env` + `cf restage`) and inspected full verbose logs. Approuter:
   - Completes a full OAuth2 login cycle correctly (authorization code → token exchange → session).
   - Correctly resolves and forwards the request to `html5-apps-repo-rt` with a valid client-credentials token (`"Sending client credentials token for service html5-apps-repo-rt"`).
   - Logs the real cause verbatim: `"GET request to https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/index.html completed with status 503 Service Unavailable check backend application logs"`.
   - This proves the 503 originates **inside html5-apps-repo-rt itself**, not in approuter's routing/auth/config.
5. **Reproduced directly against html5-apps-repo-rt, bypassing approuter completely.** Created a service key for `integration-portal-html5-repo-runtime`, fetched a token from its own `uaa` credentials, and called `https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/index.html` directly:
   ```
   HTTP/2 503
   x-apphost-cache-status: HIT
   x-token-cache-status: MISS
   <html>...openresty...503 Service Temporarily Unavailable...</html>
   ```
   Identical result. No application-level error body — this is an infrastructure-level 503 from the openresty layer in front of `html5-apps-repo-rt`.
6. **Investigated the `"Service Tag index is unknown"` warning** (present on every request in approuter's debug logs). Traced to SAP's destination/`sap.cloud.service` tagging mechanism; added the missing destination-content module (§3.5). The warning persisted **unchanged** before and after — concluded this is likely unrelated background noise, not connected to the actual routing failure.
7. **Tried explicit `app_host_id` binding.** `cf unbind-service` + `cf bind-service ... -c '{"html5-apps-repo": {"app_host_id": "<guid>"}}'` + `cf restage`. Verified via `cf env` that **the parameter was never applied** — the broker silently ignored it (no `app_host_id` key anywhere in the resulting `VCAP_SERVICES`). No effect either way.
8. **Recreated the `html5-apps-repo-runtime` service instance from scratch** (`cf delete-service` + `cf create-service` + rebind + restage) to rule out stale per-binding state. No change — identical 503.
9. **Tested cache-busting.**
   - Query-string cache-buster (`?cb=12345` / `?cb=99999`) on both the approuter URL and the direct `html5-apps-repo-rt` URL — `x-apphost-cache-status` stayed `HIT` both times, response unchanged.
   - Bumped `sap.app.applicationVersion.version` in `manifest.json` (`0.1.0` → `0.1.1`) and the MTA's top-level `version` to match, per SAP's own documented guidance that html5-apps-repo caches by app version and requires a version bump to bust it (referenced in SAP KBA 2938434 territory). Verified via **both** `cf mta integration-portal` and `cf html5-list` that the new version `0.1.1` was genuinely deployed and registered. **Still identical 503.**
10. **Decisive test: pushed a completely unrelated, minimal 3-file app** (`com.test.hello` — bare `manifest.json` + `xs-app.json` + a one-line `index.html`) directly to the same `integration-portal-html5-repo-host` instance via `cf html5-push`, bypassing the MTA/approuter pipeline entirely.
    - It also registered successfully in `cf html5-list`.
    - It **also returned the identical 503**, with the identical `x-apphost-cache-status: HIT`, when queried directly.
    - Notably, `cf html5-list` afterward showed **only** `comtesthello` — the original app's entry was no longer listed, suggesting this app-host instance may only surface one "current" app at a time, or the push overwrote/hid the prior registration.

**Conclusion of the diagnostic trail:** ~~every layer that is under this application's control (packaging, manifest structure, destination wiring, approuter config/auth, service bindings, service instance freshness, app identity/version) has been independently verified correct or exhaustively ruled out. A trivial, unrelated test app fails identically. The failure is inside SAP's managed `html5-apps-repo` service for this specific subaccount/tenant.~~

> ⚠️ **This conclusion was wrong.** See §1a. The URL used in steps 5 and 10 omitted the application-name path segment that `html5-apps-repo-rt` requires, so both "decisive" tests reproduced the same client-side mistake rather than a platform fault. One layer under this application's control — the request path built by `approuter/xs-app.json`'s `welcomeFile` — was never actually checked.

---

## 5. What was ruled out (do not re-investigate these without new evidence)

> ⚠️ Superseded by §1a. These entries are individually accurate — none of them was the cause — but the list was treated as exhaustive when it was not: the request path the approuter actually sent to `html5-apps-repo-rt` was never on it.

- ❌ Packaging structure (zip-of-zips, manifest.json location) — verified correct via direct zip inspection.
- ❌ Content not actually uploaded — verified present via `cf html5-list` and direct API queries, across two different app versions and a second unrelated app.
- ❌ Approuter authentication/session handling — full OAuth cycle completes; verbose logs show correct forwarding with a valid token.
- ❌ Approuter `xs-app.json` routing config — logged and confirmed correct (`service: html5-apps-repo-rt`, `authenticationType: xsuaa`).
- ❌ Missing `sap.cloud.service` destination tagging — added per SAP's official pattern; no change in behavior.
- ❌ Stale/incorrect service binding — explicit `app_host_id` binding attempted (broker ignored it); full instance recreation attempted; no change.
- ❌ HTTP/browser caching — disabled cache, incognito, different devices, cache-busting query strings; no change.
- ❌ App-host cache keyed on version — version bump verified deployed on both sides; no change.
- ❌ Something specific to our app's content/identity — a trivial, unrelated test app fails identically.

## 6. Things noted but not fully investigated (lower priority / unlikely but not eliminated)

- The `cflinuxfs4` stack deprecation warning seen during `cf restage` — unlikely to be related (this affects buildpack staging, not the HTML5 repo service), but not formally ruled out.
- `cf html5-list` showing only one app at a time (the newer push apparently hid/replaced the older one in the listing) — could be a CLI/listing quirk rather than a real overwrite; not confirmed either way. Worth asking SAP about directly.
- Region domain mismatch: `html5-apps-repo-rt`/`-dt` resolve under `cfapps.us10.hana.ondemand.com` while the app routes resolve under `cfapps.us10-001.hana.ondemand.com`. This is very likely normal (shared regional service vs. Cloud Foundry instance-specific subdomain) but is an environment fact worth mentioning verbatim in any SAP support conversation, in case it's landscape-relevant.

---

## 7. Recommended next steps

> ⚠️ **Superseded by §1a — do not act on these.** No SAP incident is needed, and no new space or subaccount is needed; the `html5-apps-repo` service was healthy throughout. Item 4 still stands: keep the §3 fixes. Retained below only as a record of what was planned before the real cause was found.

1. **Open an SAP incident / Community question** referencing this document's §4 diagnostic trail directly — it is unusually complete evidence (a valid runtime token reaching the service's own gateway and still getting a bare, bodyless 503, reproduced with a second unrelated app) and should let SAP support skip straight to their own backend/service logs rather than re-deriving app-side causes.
   - Relevant SAP KBAs found during research, worth citing: **2938434** ("Running an HTML5 application in a repository scenario fails with error 503 Service Unavailable"), **2939554** ("validation error: manifest.json not found"), **3687567** ("HTML5 apps is not visible in BTP Cockpit HTML5 Applications section after deployment").
2. **Try a brand-new CF space within the same subaccount first** (cheap, ~10 minutes) — since `html5-apps-repo` service instances are space-scoped, this tests whether the stuck state is instance/space-level rather than subaccount/tenant-level. All of `mta.yaml`'s resources are already space-relative, so no code changes are needed — just `cf create-space`, target it, and redeploy. See the deployment steps already covered separately for doing this.
3. **If a new space also fails, try a brand-new BTP Trial subaccount** (or a fresh Trial account entirely) — this fully sidesteps any subaccount/tenant-level stuck state in the `html5-apps-repo` broker. Remember to recreate the `INTEGRATIONPORTAL_CPI_PRIMARY` destination manually (it's not part of the MTA) and assign role collections to your user after the first deploy.
4. **Keep all fixes from §3** regardless of which path resolves this — they are real, necessary corrections independent of the platform issue.

---

## 8. Quick reference — key facts for a support ticket

- App-host-id: `1682932d-670a-4660-92a4-c353611272cf`
- Service instance: `integration-portal-html5-repo-host` (app-host plan), `integration-portal-html5-repo-runtime` (app-runtime plan, recreated once during diagnosis)
- Failing URL (direct, bypassing approuter): `https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/index.html`
- Response: `HTTP/2 503`, `x-apphost-cache-status: HIT`, `x-token-cache-status: MISS`, body is the generic `openresty` 503 page (no application-level error detail)
- Reproduced with two independent apps: `commiddlewareopsintegrationportal` (the real app, versions 0.1.0 and 0.1.1) and `comtesthello` (a throwaway 3-file test app)
- Org/space: `d0e06a1ftrial` / `dev`
