# Backend tests

Unit tests for the stateless backend, using Node's built-in test runner (`node:test`) executed
through `tsx` so TypeScript sources run directly.

## Running

```bash
npm test --workspace=srv
```

(`node --import tsx --test test/**/*.test.ts`)

## Conventions

- Tests import pure modules by their `.js` specifier (resolved to `.ts` by `tsx`), e.g.
  `../../src/core/http/pagination.js`.
- Keep unit tests free of modules that read `config.json`/environment at import time (`config.ts`,
  `env.ts`) so tests need no ambient environment. Route/controller integration tests (added in a
  later phase) will spin up the Express app via `createApp()` with a fixture config.
- `test/` is excluded from the production `tsc` build (`tsconfig.json`).
