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

```bash
npm install          # installs all workspaces
npm run build        # builds frontend (dist/) and backend (gen/)
npm run start:srv    # runs the backend locally
npm run start:app    # runs the UI5 dev server locally
```

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
