# App Router

The `@sap/approuter` entry point for the Integration Portal.

## Responsibilities

- Serve the UI5 frontend from the HTML5 Application Repository (`html5-apps-repo-rt`).
- Reverse-proxy `/api/*` to the backend (`srv-api` destination) with the authenticated user's
  JWT forwarded (`forwardAuthToken`), enforcing XSUAA authentication and CSRF protection.
- Proxy `/ws/*` WebSocket upgrades to the backend for the Live Monitoring feed.
- Enforce the login/logout session flow.

## Configuration

- [`xs-app.json`](xs-app.json) — route table and authentication policy.
- Destinations (`srv-api`) and service bindings are declared in the root [`mta.yaml`](../mta.yaml).

This module contains no application code; it is pure configuration over the standard SAP approuter.
