# `shell/notifications/` — Notification Center (§13)

A reusable notification center over the frozen global `NotificationModel` that backs the shell bell.
Framework only — it ships **empty of content**; a future Alert Notification integration calls
`notify(...)` to feed live alerts in and every existing binding lights up unchanged.

## `NotificationCenter`

- **Raise**: `notify({title, description, category})`, plus `info` / `warning` / `error` /
  `critical` convenience methods. Categories reuse the shared `SeverityValue` so colours match
  alerts/health everywhere.
- **Unread count**: `getUnreadCount()`.
- **Filtering**: `filterByCategory(category)`.
- **Dismiss / read**: `dismiss(id)`, `markRead(id)`, `markAllRead()`, `clear()`.
- **History**: `getHistory()` (newest first, capped by the model).

`initialize(model)` binds the center to the component-owned `NotificationModel` during bootstrap.
The Shell's `NotificationPanel.fragment.xml` renders the list with per-item dismiss and a clear-all
action; opening the bell marks everything read.

## Model extensions

`NotificationModel` (core) was extended additively with `markRead(id)` and `dismiss(id)` alongside
its existing `add` / `markAllRead` / `clear`.
