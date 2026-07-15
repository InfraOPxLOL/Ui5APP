# `srv/` — Stateless backend (Node.js + Express + TypeScript)

The backend for the Integration Portal. It authenticates requests, resolves Destinations, calls SAP
Integration Suite APIs, and transforms/aggregates responses. **It holds no business data** — every
request fetches live from Integration Suite (architecture §1, §16).

## Layout

| Path | Responsibility |
|---|---|
| `src/server.ts` | Process entry point: HTTP + WebSocket bootstrap, graceful shutdown. |
| `src/app.ts` | Express assembly and the canonical middleware order. |
| `src/config/` | The configuration framework: `ConfigService.ts` (singleton loader/validator — the only class that reads config files), `schemas/` (one zod schema per `config/*.json`), `env.ts` (validated env), `destinations.ts`, `xsuaa.ts`, `config.ts` (deprecated facade). |
| `src/core/providers/` | Abstract provider contracts to Integration Suite (`IMonitoringProvider`, `IJmsProvider`, …) — interfaces only, no HTTP. See its README. |
| `src/core/middleware/` | correlationId → requestLogger → auth → rateLimiter → validateRequest → terminal errorHandler. |
| `src/core/errors/` | `AppError` base, `HttpError` (4xx taxonomy), `UpstreamError` (CPI normalization). |
| `src/core/logging/` | Structured pino logger + `auditLog` (audit is a tagged log line, not a store). |
| `src/core/http/` | `IntegrationSuiteClient` (the single CPI gateway), `RestClient`, `pagination`, request `context`. |
| `src/core/websocket/` | Live-monitoring WebSocket server + upgrade auth. |
| `src/core/memo/` | In-flight request de-duplication (not a cache). |
| `src/core/jobs/` | In-process periodic job scheduler. |
| `src/routes/index.ts` | Mounts every module router under `/api/v1` + system endpoints. |
| `src/modules/<kebab>/` | Per module: `routes.ts`, `controller.ts`, `service.ts`, `dto.ts`, `validators.ts`. |
| `test/` | `node:test` unit tests (run via `tsx`). |

## Layering rule

`controller → service → IntegrationSuiteClient`. Controllers are thin (parse → call service → shape
response). Only services call the CPI client; only they map raw CPI payloads into the module DTOs, so
no upstream shape leaks upward.

## Scripts

```bash
npm run build --workspace=srv     # tsc → gen/
npm run start --workspace=srv     # node gen/server.js
npm run start:dev --workspace=srv # tsx watch (hot reload)
npm test --workspace=srv          # node:test via tsx
```

## Configuration

Reads the single `config/config.json` surface (validated at boot; fails fast on invalid config).
No database, no persistence service. Local runs default to port 4004; Cloud Foundry injects `PORT`.
Set `CONFIG_PATH` to point at a specific config file when needed.
