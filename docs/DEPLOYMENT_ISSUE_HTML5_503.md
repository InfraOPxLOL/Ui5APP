# Deployment Issue: Persistent 503 from HTML5 Application Repository

**Status:** RESOLVED — the §3.5 destination/`sap.cloud.service` tagging fix resolved the 503. Deployment now works end-to-end.
**Last updated:** 2026-10-05
**Affected environment:** SAP BTP Trial, subaccount `d0e06a1ftrial`, org `d0e06a1ftrial`, space `dev`, landscape `us10-001` (Cloud Foundry), `us10` (html5-apps-repo services)

---

## 1. Summary

The Integration Portal deploys cleanly to Cloud Foundry — both `integration-portal-srv` and `integration-portal-approuter` report `1/1` running, `cf deploy` finishes with no errors, and the UI5 app content is confirmed registered in the HTML5 Application Repository (`cf html5-list` shows it). Despite this, every request to the approuter's URL returns:

```
503 Service Temporarily Unavailable
openresty
```

Deep diagnosis (detailed below) traced this to `html5-apps-repo-rt` (the HTML5 Application Repository **runtime** service) itself returning 503 for **any** application pushed to this subaccount's `html5-apps-repo-host` instance — including a trivial, unrelated 3-file test app created purely to isolate the cause. At the time, this pointed toward a stuck managed-service state. **It later turned out to be resolvable from the application side**: the §3.5 fix (adding the missing `sap.cloud.service` destination tagging) was the actual cause of the 503, not a dead end as originally assessed — see §3.5 and the updated §4/§5 notes below. Deployment now works end-to-end.

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

**Fix:** added an `integration-portal-destination-content` module (matching SAP's official pattern) that creates destinations tagging both `integration-portal-html5-repo-host` and `integration-portal-xsuaa` with `sap.cloud.service: integration-portal`; added `"sap.cloud": { "service": "integration-portal" }` to `manifest.json`. **This fix resolved the 503.** At the time this was written it appeared to have no effect (identical 503 observed immediately after), but it turned out to be the actual fix — likely needed a subsequent redeploy/restage cycle or some propagation delay in SAP's destination/routing resolution before `html5-apps-repo-rt` picked it up. Deployment now works end-to-end.

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
6. **Investigated the `"Service Tag index is unknown"` warning** (present on every request in approuter's debug logs). Traced to SAP's destination/`sap.cloud.service` tagging mechanism; added the missing destination-content module (§3.5). This turned out to be the actual fix — the 503 cleared after this change (initial testing immediately after applying it was inconclusive/misread as no change, but it was in fact resolved).
7. **Tried explicit `app_host_id` binding.** `cf unbind-service` + `cf bind-service ... -c '{"html5-apps-repo": {"app_host_id": "<guid>"}}'` + `cf restage`. Verified via `cf env` that **the parameter was never applied** — the broker silently ignored it (no `app_host_id` key anywhere in the resulting `VCAP_SERVICES`). No effect either way.
8. **Recreated the `html5-apps-repo-runtime` service instance from scratch** (`cf delete-service` + `cf create-service` + rebind + restage) to rule out stale per-binding state. No change — identical 503.
9. **Tested cache-busting.**
   - Query-string cache-buster (`?cb=12345` / `?cb=99999`) on both the approuter URL and the direct `html5-apps-repo-rt` URL — `x-apphost-cache-status` stayed `HIT` both times, response unchanged.
   - Bumped `sap.app.applicationVersion.version` in `manifest.json` (`0.1.0` → `0.1.1`) and the MTA's top-level `version` to match, per SAP's own documented guidance that html5-apps-repo caches by app version and requires a version bump to bust it (referenced in SAP KBA 2938434 territory). Verified via **both** `cf mta integration-portal` and `cf html5-list` that the new version `0.1.1` was genuinely deployed and registered. **Still identical 503.**
10. **Decisive test: pushed a completely unrelated, minimal 3-file app** (`com.test.hello` — bare `manifest.json` + `xs-app.json` + a one-line `index.html`) directly to the same `integration-portal-html5-repo-host` instance via `cf html5-push`, bypassing the MTA/approuter pipeline entirely.
    - It also registered successfully in `cf html5-list`.
    - It **also returned the identical 503**, with the identical `x-apphost-cache-status: HIT`, when queried directly.
    - Notably, `cf html5-list` afterward showed **only** `comtesthello` — the original app's entry was no longer listed, suggesting this app-host instance may only surface one "current" app at a time, or the push overwrote/hid the prior registration.

**Conclusion of the diagnostic trail:** steps 7–10 (explicit `app_host_id` binding, service instance recreation, cache-busting, the unrelated test-app push) were genuine dead ends and remain ruled out. The actual fix was step 6/§3.5 — the missing destination/`sap.cloud.service` tagging. Once that module and manifest change were in place (and the app redeployed), the 503 cleared. Deployment now works end-to-end.

---

## 5. What was ruled out (confirmed not the cause)

- ❌ Packaging structure (zip-of-zips, manifest.json location) — verified correct via direct zip inspection.
- ❌ Content not actually uploaded — verified present via `cf html5-list` and direct API queries, across two different app versions and a second unrelated app.
- ❌ Approuter authentication/session handling — full OAuth cycle completes; verbose logs show correct forwarding with a valid token.
- ❌ Approuter `xs-app.json` routing config — logged and confirmed correct (`service: html5-apps-repo-rt`, `authenticationType: xsuaa`).
- ❌ Stale/incorrect service binding — explicit `app_host_id` binding attempted (broker ignored it); full instance recreation attempted; no change.
- ❌ HTTP/browser caching — disabled cache, incognito, different devices, cache-busting query strings; no change.
- ❌ App-host cache keyed on version — version bump verified deployed on both sides; no change.
- ❌ Something specific to our app's content/identity, in isolation — a trivial, unrelated test app also failed with the destination tagging missing, consistent with it being a tenant/routing-level gap rather than an app-content issue.

**✅ Actual cause:** missing `sap.cloud.service` destination tagging (§3.5) — approuter's dynamic routing to `html5-apps-repo-rt` needs this to resolve which app to serve. Adding the `integration-portal-destination-content` module + `manifest.json` tagging fixed it.

## 6. Things noted but not fully investigated (lower priority / unlikely but not eliminated)

- The `cflinuxfs4` stack deprecation warning seen during `cf restage` — unlikely to be related (this affects buildpack staging, not the HTML5 repo service), but not formally ruled out.
- `cf html5-list` showing only one app at a time (the newer push apparently hid/replaced the older one in the listing) — could be a CLI/listing quirk rather than a real overwrite; not confirmed either way. Worth asking SAP about directly.
- Region domain mismatch: `html5-apps-repo-rt`/`-dt` resolve under `cfapps.us10.hana.ondemand.com` while the app routes resolve under `cfapps.us10-001.hana.ondemand.com`. This is very likely normal (shared regional service vs. Cloud Foundry instance-specific subdomain) but is an environment fact worth mentioning verbatim in any SAP support conversation, in case it's landscape-relevant.

---

## 7. Resolution

The fix was §3.5: adding the `integration-portal-destination-content` module (creating destinations tagging `integration-portal-html5-repo-host` and `integration-portal-xsuaa` with `sap.cloud.service: integration-portal`) plus the matching `"sap.cloud": { "service": "integration-portal" }` block in `manifest.json`. This is required for approuter's dynamic routing to resolve which app to serve via `html5-apps-repo-rt` — without it, the runtime service returns a bare 503 with no application-level error detail, which is why it was initially indistinguishable from a platform-side failure.

All fixes from §3 (3.1–3.5) are now part of the working `mta.yaml` / `manifest.json` and should stay as-is. No SAP incident or new space/subaccount was needed — the KBAs in the original draft (2938434, 2939554, 3687567) are left below for reference in case a similar symptom resurfaces elsewhere.

---

## 8. Quick reference — key facts

- App-host-id: `1682932d-670a-4660-92a4-c353611272cf`
- Service instance: `integration-portal-html5-repo-host` (app-host plan), `integration-portal-html5-repo-runtime` (app-runtime plan, recreated once during diagnosis)
- Previously-failing URL (direct, bypassing approuter): `https://html5-apps-repo-rt.cfapps.us10.hana.ondemand.com/index.html`
- Symptom while broken: `HTTP/2 503`, `x-apphost-cache-status: HIT`, `x-token-cache-status: MISS`, body is the generic `openresty` 503 page (no application-level error detail)
- Reproduced with two independent apps while broken: `commiddlewareopsintegrationportal` (the real app, versions 0.1.0 and 0.1.1) and `comtesthello` (a throwaway 3-file test app)
- Org/space: `d0e06a1ftrial` / `dev`
- Fix: `sap.cloud.service` destination tagging (§3.5) — see §7.
