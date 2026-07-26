# Local Setup — running the Integration Portal on a new machine

This is the practical "clone it and run it" guide. For the architecture and deployment story see
[`README.md`](README.md); for the configuration surface see [`config/README.md`](config/README.md);
for pointing at a real Integration Suite tenant see
[`docs/CONNECTIVITY_GUIDE.md`](docs/CONNECTIVITY_GUIDE.md).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 20 | Bundles npm ≥ 10 — both are required by every workspace's `engines` field. |
| **Git** | any | To clone the repo. |
| **A Chromium browser** | any | Chrome / Edge / Brave to open the app. |
| **Internet access** | — | `ui5 serve` fetches the SAPUI5 framework live from `https://ui5.sap.com` (see `app/ui5.yaml`) — even "local" dev needs a connection. Real mode additionally calls your Integration Suite tenant. |

**Not needed for local dev:** Java, the Cloud Foundry CLI (`cf`), the MTA build tool (`mbt`), or any
database. Those are deployment-only. There is **no persistence layer** — the backend is stateless and
fetches everything live (or from mock fixtures).

---

## 2. Clone and install

```bash
git clone <your-repo-url> SAP-UI5-APP
cd SAP-UI5-APP
npm install
```

This is an **npm-workspaces monorepo** — `npm install` at the root installs all workspaces (`app`,
`srv`, `approuter`) in one command and regenerates `node_modules/` (which is gitignored).

---

## 3. Recreate the `.env` file (the one thing that is NOT in git)

`.env` lives at the **repo root** (next to `package.json`) and is **gitignored** because it holds the
Integration Suite tenant's OAuth secret. You must create it yourself on a new machine — it will not
come from GitHub. You have two options.

### Option A — run against the real trial tenant (production-like data)

Create a file named `.env` at the repo root:

```
CPI_PRIMARY_CLIENT_ID=<your trial tenant OAuth client id>
CPI_PRIMARY_CLIENT_SECRET=<your trial tenant OAuth client secret>
JMS_QUEUE_DISCOVERY_MODE=Fetch_All
```

- These variable names are fixed by convention: `CPI_<TENANTID>_CLIENT_ID` / `_CLIENT_SECRET`, where
  `<TENANTID>` is the `id` from `config/tenants.json` upper-cased (`primary` → `PRIMARY`). If you rename
  the tenant id, rename these accordingly.
- They pair with `config/connectivity.json`, which already declares tenant `primary` uses
  `oauth-client-credentials` with a token URL. That file **is** committed; only the secrets live in
  `.env`.
- Copy the two secret values from a machine that already has them (password manager / secure transfer).
  **Never** paste them into chat, commit them, or share them.
- Where the values come from: **SAP BTP Cockpit** → the subaccount hosting the tenant → your Process
  Integration Runtime service instance → create a **Service Key** → its JSON gives `clientid`,
  `clientsecret`, and the token URL.

### Option B — run with seeded mock data, no credentials at all

1. Do **not** create `.env` (or leave it empty).
2. Edit `config/connectivity.json` → change `"mode": "real"` to `"mode": "mock"`.

Everything works identically — same UI, same flows, same modules — but the data is realistic seeded
fixtures instead of a live tenant. This is the fastest way to confirm a fresh clone runs. (Message
Monitoring's JMS-retry "happy path" is only fully exercisable in mock mode anyway, since the trial
tenant has no message that actually passed through the JMS bridge flows.)

---

## 4. Start the two dev servers (two terminals)

### Terminal 1 — backend (`:4004`)

```bash
cd srv
npm run start:dev
```

**Use `start:dev`, not `start:srv`.** `start:dev` runs the TypeScript directly via `tsx watch` — no
build step, and it auto-restarts on file changes. `start:srv` runs the **compiled** output at
`gen/server.js`, which is gitignored and does not exist on a fresh clone, so it fails with a
"cannot find `gen/server.js`" error. (If you specifically want the compiled path, run `npm run
build:srv` once first, then `npm run start:srv`.)

### Terminal 2 — frontend (`:8080`), from the repo root

```bash
npm run start:app
```

This runs `ui5 serve`, which also reverse-proxies `/api` to the backend on `:4004` (configured in
`app/ui5.yaml`).

---

## 5. Open the app

```
http://localhost:8080/index.html#/dashboard
```

**No login screen appears.** `config/environment.json` has `kind: "development"`, which makes the
backend bypass XSUAA authentication and hand you a hardcoded **"Local Developer"** identity that holds
every permission scope. This is intentional for local dev. (Auth is only enforced when deployed to BTP
Cloud Foundry behind the app router.)

---

## 6. (Optional) verify it's healthy

```bash
# backend responding with real/mock data:
curl http://localhost:4004/api/v1/coe-admin

# backend test suite (expect all passing):
cd srv && npm test

# frontend type-check:
cd app && npx tsc --noEmit -p .
```

The frontend QUnit unit tests have **no headless CI runner** — they run in a browser by opening
`http://localhost:8080/test/unit/unitTests.qunit.html` while the dev server is up.

---

## 7. Common gotchas (all hit during development)

- **`npm run start:srv` fails on a fresh clone** → missing `gen/` build output. Use `start:dev`, or
  run `npm run build:srv` once first.
- **Edited a `config/*.json` file and nothing changed** → the backend's `ConfigService` reads every
  `config/*.json` **once at boot and freezes it**. Restart the backend (Terminal 1) for any config
  change — including switching mock↔real or changing a tenant URL. There is no hot-reload for config.
- **A code change "isn't showing up" in the browser** → it's a single-page app; already-loaded JS does
  not hot-swap. Hard-refresh the tab (Ctrl+Shift+R), and make sure you're on the right port (it's easy
  to end up with a second `ui5 serve` on `:8081` and be looking at the wrong one).
- **`ConfigurationError` at backend startup** → malformed or missing `.env` / `config/connectivity.json`
  (e.g. `real` mode with no credentials set, or a bad token URL). The error message names the exact
  file and field. If you just want it running without the tenant, switch to mock mode (Option B).
- **Everything 404s or the shell won't load** → confirm both servers are up (`:4004` and `:8080`) and
  that you have internet access (the UI5 framework is fetched from `ui5.sap.com` at runtime).

---

## 8. Changing which tenant / BTP endpoints it talks to

Three places, edited together (the first two are committed config; the third is your local secret):

1. **`config/tenants.json`** → `baseUrl` (the tenant's Integration Suite API root, ends in `/api/v1`)
   and `region`.
2. **`config/connectivity.json`** → `tenantAuth[].oauthTokenUrl` (the tenant's OAuth token endpoint);
   `tenantId` here must match the `id` in `tenants.json`.
3. **`.env`** → `CPI_<TENANTID>_CLIENT_ID` / `CPI_<TENANTID>_CLIENT_SECRET` (never committed).

Then restart the backend (config is frozen at boot). Full walkthrough in
[`docs/CONNECTIVITY_GUIDE.md`](docs/CONNECTIVITY_GUIDE.md).
