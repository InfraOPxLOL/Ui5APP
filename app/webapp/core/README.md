# `core/` — framework layer

Framework-level building blocks shared by the shell and every module. **Contains zero business
logic and no knowledge of any specific module.**

| Folder | Responsibility |
|---|---|
| `base/` | Abstract base classes every controller/component/service/dialog extends. |
| `types/` | Cross-cutting TypeScript interfaces and type aliases (module, config, API, table). |
| `constants/` | Central constants: statuses (`MessageStatus`, `QueueStatus`, `Severity`, `RetryState`), routes, `Icons`, `Colors`, `DateFormats`, `FileTypes`/`ContentTypes`. Nothing status-, icon- or format-shaped is hardcoded elsewhere. |
| `formatters/` | Pure, locale-aware formatting functions; imported via the `index.ts` barrel. |
| `utils/` | Stateless utility framework: `DateUtils`, `TimeUtils` (incl. debounce/throttle), `StringUtils`, `JsonUtils`, `XmlUtils`, `DownloadUtils`, `ClipboardUtils`, `ValidationUtils`, `SearchUtils`, plus `FilterBuilder`, `ODataV4Helper`, `ExportHelper`, `DeepLinkHelper`. |
| `events/` | Typed `AppEventBus` — the only sanctioned cross-module communication channel. |
| `errors/` | `AppError` hierarchy (validation, network, auth, authorization, configuration, backend, Integration Suite, service, unknown), envelope→error mapper, central `ErrorHandler`. |
| `logging/` | `ClientLogger` framework — levels up to `critical`, category loggers, config-driven shipping to the backend log stream. |
| `models/` | Global application models (`app`, `configState`, `theme`, `user`, `tenant`, `notifications`) — see `models/README.md`. |
| `services/` | Framework services: `ApiClient`, `WebSocketClient`, `ConfigService`, `SessionService`, `DialogService`, `TableConfigService`, `ThemeService`. |

## Import rule

Modules import **from** `core/` (and `library/`), never the reverse. `core/` must never import from
`modules/` or `shell/`. This keeps the dependency graph acyclic and lets the framework layer be
reasoned about in isolation.
