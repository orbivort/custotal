# Architecture

Custotal is a pnpm monorepo with two deployable packages and a single shared API contract.

- `packages/backend` — Express 5 + Prisma 7 + PostgreSQL REST API.
- `packages/frontend` — React 19 + Vite 8 + React Router 8 + Tailwind CSS 4 SPA.

This document is the public entry point to the design.

## Backend

### Request lifecycle

```
src/index.ts   bootstrap + graceful shutdown (SIGTERM/SIGINT, 10 s grace)
   └─ src/app.ts   createApp() — exported so tests build an identical app
        └─ src/routes/*-routes.ts   validate + authorize + serialize HTTP
             └─ src/services/*-service.ts   business logic, transactions, RBAC scoping
                  └─ src/db.ts   Prisma client via @prisma/adapter-pg
```

Middleware order is fixed in `src/app.ts` and matters:

security headers → CORS allow-list → request-id → pino-http → scoped JSON body parser
(`/api/import` gets 12 MB, everything else 1 MB, and the scoped parser runs first) → cookie-parser →
`/health` → `sessionLoader` → `generalLimiter` (both only under `/api`) → routers → 404 →
centralized error handler.

### Configuration

All environment variables are parsed and validated eagerly in `src/config.ts`. Invalid `NODE_ENV`,
`INSTANCE_ENVIRONMENT`, or `COOKIE_SAMESITE` values throw at startup. Add new variables there
(typed), never scattered through modules.

### Errors

Responses use the envelope `{ error: { code, message, details? } }`. Construct them with the
`errors.*` factories in `src/lib/errors.ts` and throw an `Error` subclass; the centralized handler
serializes them and maps Prisma errors (`P2002` → conflict, `P2003` → in_use, `P2025` → not_found).

### Authentication and authorization

Sessions are database-backed: the client holds an opaque token in the HttpOnly `ct_session` cookie,
and only its SHA-256 digest is stored (`Session.tokenHash`). `sessionLoader` slides an 8-hour idle
window. Guards (`requireUser`, `requireCanEdit`, `requireAdmin`, `authedUser`) live in
`src/middleware/auth.ts`; role rules live in `src/lib/rbac.ts`.

- `canEditRole` — admin/manager/rep may write; viewers may not.
- `canViewOwnerScoped` — representatives see only their own owner-scoped records.

### Data model conventions

- All ids are `uuid` with the database default `uuidv7()`.
- Audit references (`createdBy`, `ownerId`, …) are plain uuid scalars, not foreign keys — except
  `Session` and `PasswordResetToken`, which cascade off `User`.
- Money is stored as `valueMinor` (integer minor units).
- Updates carry the client's `updatedAt`; services call `assertNoConflict`
  (`src/lib/validation.ts`) to return `409` on a stale write.
- Soft deletes are used throughout, with a 30-day purge window.

Prisma 7 requires a driver adapter — `src/db.ts` uses `@prisma/adapter-pg`, and datasource URLs live
in `prisma.config.ts` rather than `schema.prisma`.

### Module system

Backend ESM imports use explicit `.ts` extensions (e.g. `from './app.ts'`): Node 24 runs TypeScript
sources directly via type stripping, and the backend tsconfig sets `moduleResolution: NodeNext` and
`allowImportingTsExtensions`.

## Frontend

### Entry and routing

`src/main.tsx` renders `<App/>`; MSW boots only when `import.meta.env.DEV && env.mocksEnabled`.
`src/App.tsx` is the single route table (React Router data router). Pages are `lazy()`-loaded per
chunk, and `RequireAuth` / `RequireRole role="admin"` gate whole trees.

### Data flow

```
pages & components      (features/*, components/*)
      │ typed functions
      ▼
per-domain services     (features/*/*Api.ts)  — own all '/api/...' paths
      │
      ▼
HTTP client             (src/lib/api.ts)  — base URL + credentials
      │
      ├─ real mode → /api (same origin; Vite dev proxy → backend :4000)
      └─ mock mode → MSW intercepts /api/* in the dev server only
```

**Service modules are the only place allowed to import the `api` client or write `/api/...` paths.**
Components fetch through the in-house hooks `useQuery` / `useMutation` in `src/lib/hooks.ts` (there is
no react-query). Domain/DTO types live in `src/types/domain.ts`.

### State and environment

`SessionProvider` (`features/auth/SessionContext.tsx`) and `MetaContext` hold cross-cutting state.
All Vite variables are parsed once in `src/config/env.ts` (`env.apiBaseUrl`, `env.mocksEnabled`,
`env.defaultCurrency`) — read from there, never from `import.meta.env` directly.

### Mock Service Worker

MSW is a dev-only opt-in (`VITE_ENABLE_MOCKS=true`). Handlers live in `src/mocks/handlers/*` and
persist to a localStorage-backed store. Gating on the statically replaced `import.meta.env.DEV` lets
the bundler drop the entire mock graph from production builds.

## Contract parity

A single API contract is expressed several times. Changing it means updating all affected layers in
the same pull request:

1. Backend: `prisma/schema.prisma` (+ migration) and the matching
   `src/services/*-service.ts` / `src/routes/*-routes.ts`.
2. Frontend types: `src/types/domain.ts`.
3. Frontend service: the matching `features/*/*Api.ts`.
4. MSW mock: the matching `src/mocks/handlers/*.ts`, including new query parameters.

The full endpoint list is in the [API reference](api.md).

## Testing architecture

Vitest runs as one workspace with multiple projects; the root `vitest.config.ts` orchestrates and
each package owns its settings.

| Tier                | Config                                          | Characteristics                                       |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Frontend            | `packages/frontend/vitest.config.ts`            | jsdom + Testing Library, CSS stubbed.                 |
| Backend unit        | `packages/backend/vitest.config.ts`             | Pure logic; no DB, no server, no global setup.        |
| Backend integration | `packages/backend/vitest.integration.config.ts` | Supertest against the real app + `TEST_DATABASE_URL`. |
| Backend e2e         | `packages/backend/vitest.e2e.config.ts`         | Black-box HTTP against a real server process.         |

Integration files run sequentially because they share one database. Coverage is declared once in
`packages/backend/test/support/vitest-shared.ts` and imported by each backend tier config.

## Deployment shape

The backend assumes a **single process instance** at this stage (in-memory rate limiting, in-process
purge timer). The frontend is a static SPA expected to be served from the same origin as the API.
See [Self-hosting](self-hosting.md) and
[operations notes](../packages/backend/docs/operations-notes.md) for the constraints and the
runbook.
