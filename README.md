# Integration Portal

Enterprise operations & observability platform for **SAP Integration Suite** — an independent,
stateless monitoring product that consumes Integration Suite's OData/REST/JMS/Alert Notification
APIs as a live data source. Think "Splunk for SAP Integration Suite".

> Namespace: `com.middlewareops.integrationportal`
> Architecture of record: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — **approved, do not change without instruction.**

## Key constraint: the backend is stateless

There is **no database**. Every request fetches live from Integration Suite. The only persisted
configuration is the typed file set under [`config/`](config/) (one JSON file per domain,
validated at boot — see [config/README.md](config/README.md)). See §11/§16 of the architecture.

## Repository layout

| Path | Workspace | Purpose |
|---|---|---|
| `app/` | `@integration-portal/app` | SAP UI5 + TypeScript frontend (shell + lazy-loaded module components) |
| `srv/` | `@integration-portal/srv` | Node.js + Express stateless backend (module routers → services → CPI clients) |
| `approuter/` | `integration-portal-approuter` | SAP App Router (auth, static hosting, `/api` proxy) |
| `config/` | — | Single external configuration surface |
| `docs/` | — | Architecture and design documentation |
| `mta.yaml` | — | Multi-Target Application descriptor for BTP Cloud Foundry deployment |
| `xs-security.json` | — | XSUAA scopes, role templates, role collections |

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Cloud Foundry CLI + MultiApps plugin (`cf`, `mbt`) for deployment

## Getting started

**New machine? Follow [`SETUP.md`](SETUP.md)** — the full clone-and-run guide (prerequisites, the
gitignored `.env` you must recreate, mock vs. real mode, and common gotchas).

Quick version for active development (no build step needed — `start:dev` runs TypeScript directly):

```bash
npm install                    # installs all workspaces
# create .env at repo root (see SETUP.md) — or set connectivity.json mode:"mock" to skip it
cd srv && npm run start:dev    # backend on :4004 (tsx watch, auto-restart)
npm run start:app              # frontend on :8080 (from repo root)
# open http://localhost:8080/index.html#/dashboard
```

> `npm run start:srv` runs the **compiled** `gen/` output (gitignored) — it fails on a fresh clone.
> Use `start:dev` for local dev, or `npm run build` first if you specifically want the compiled path.

## Deployment (SAP BTP, Cloud Foundry)

```bash
npm run deploy       # mbt build + cf deploy
```

No persistence service is provisioned — only approuter, backend, XSUAA and Destination.

## Phase status

This repository is the **Phase 1 scaffold**: complete production-grade project skeleton with
placeholder service implementations. Business functionality (Monitoring, JMS, Replay, etc.) is
implemented in later phases. Every module is already registered, routed, and present in the
sidebar.
