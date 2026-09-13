# Frontend ↔ Backend API Integration

This document explains how the Custotal frontend talks to its data source,
how to switch between **real API** and **mock data (MSW)**, and how to extend
the integration without scattering requests across components.

## Data flow

```
Pages & shared components          (features/*, components/*)
        │  import typed functions
        ▼
Per-domain service modules         (features/*/*Api.ts)  → own all '/api/...' paths
        │
        ▼
HTTP client                        (src/lib/api.ts)  → base URL + credentials
        │
        ├── real mode  → Vite dev proxy '/api' → backend :4000   (or VITE_API_BASE_URL)
        └── mock mode  → MSW browser worker intercepts '/api/*'  (dev only)
```

- **Service modules are the only place that imports the `api` client or writes
  endpoint paths.** No page or shared component should contain a `/api/...`
  string or call `api.get(...)` directly.
- Components read data through the shared hooks in `src/lib/hooks.ts`
  (`useQuery` for reads, `useMutation` for submissions) and render the shared
  `Feedback` components (`LoadingBlock`, `ErrorBanner`, `EmptyState`) plus
  `useToast` for action results.
- Domain/DTO types live in `src/types/domain.ts`; every service module returns
  those shared types.

## Data source toggle (`VITE_ENABLE_MOCKS`)

| Value                      | Behavior                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| unset (default)            | **Real API.** Requests go to the same origin (dev proxy / deployed host). |
| `true`                     | MSW intercepts `/api/*` in the Vite dev server only.                      |
| anything else / prod build | MSW never boots.                                                          |

Set it for local mock-driven work in a frontend-only `.env.local`:

```dotenv
VITE_ENABLE_MOCKS=true
```

MSW is **excluded from non-development builds**. `src/main.tsx` gates the MSW
boot behind `if (import.meta.env.DEV)`. Vite replaces `import.meta.env.DEV`
with `false` during production builds, so the block — and the entire mock
module graph — is eliminated. The `validate` workflow confirms this by grepping
the production bundle for the mock database marker (`custotal-db-v1`).

## Environment variables

| Variable                | Default                 | Purpose                                               |
| ----------------------- | ----------------------- | ----------------------------------------------------- |
| `VITE_ENABLE_MOCKS`     | unset → off             | Opt into Mock Service Worker (dev only).              |
| `VITE_API_BASE_URL`     | empty                   | Absolute backend origin for cross-origin deployments. |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` | Dev-proxy target override (rarely needed).            |

All variables are parsed once in `src/config/env.ts` (`env.apiBaseUrl`,
`env.mocksEnabled`) and read from there everywhere.

Copy `packages/frontend/.env.example` to `.env.local` to experiment.

## Base URL strategy

- **Default (recommended): same origin.** `VITE_API_BASE_URL` is empty, so the
  client calls relative `/api/...` paths.
  - **Development:** `vite.config.ts` proxies `/api` to the backend
    (`http://localhost:4000` by default). Requests stay same-origin, so the
    `ct_session` HttpOnly cookie flows without CORS or SameSite edge cases.
  - **Production/staging:** deploy the SPA and API behind one origin (e.g. an
    nginx reverse proxy), exactly as the backend CORS comment assumes.
- **Cross-origin deployments:** set `VITE_API_BASE_URL` to the API origin
  (e.g. `https://api.custotal.example`). The client always sends
  `credentials: 'include'`, so the session cookie is attached to cross-origin
  requests; the backend must list that origin in its `CORS_ORIGINS` allow-list
  (`Access-Control-Allow-Credentials: true`).
- When mocks are enabled, the base URL is forced to `''` so MSW handlers
  (which match relative `/api/*` paths) keep intercepting traffic.

## Authentication notes

- Login stores a session in the **HttpOnly `ct_session` cookie**; the client
  never sees the token.
- The HTTP client always sends `credentials: 'include'` (harmless for
  same-origin, required for cross-origin) and sends the JSON content-type by
  default.
- Network failures (server down / CORS / offline) reject with
  `ApiError('unreachable', …)`; the login screen special-cases this code to
  show retry guidance.
- Every API error decodes to the backend envelope
  `{ error: { code, message, details? } }` via `ApiError`. Pages surface
  `error.message`; forms can map `error.details` to field errors.
- When a failure carries **no** envelope (e.g. a reverse proxy's bare 502),
  `ApiError.message` is filled with readable copy for the status from
  `src/lib/httpErrors.ts` (`describeHttpStatus`) instead of a raw code like
  `Request failed (502)`. The numeric status stays on `ApiError.status` for
  logging and branching; the route error boundary reuses the same helper.

## Service layer conventions

Each domain owns a module in its feature folder:

```
features/auth/authApi.ts                      /api/auth/*, /api/health
features/meta/metaApi.ts                      /api/meta, /api/stages
features/contacts/contactsApi.ts              /api/contacts*
features/accounts/accountsApi.ts              /api/accounts*
features/interactions/interactionsApi.ts      /api/interactions*
features/pipeline/opportunitiesApi.ts         /api/opportunities*
features/tasks/tasksApi.ts                    /api/tasks*
features/reports/reportsApi.ts                /api/reports/*
features/search/searchApi.ts                  /api/search
features/admin/adminApi.ts                    /api/admin/* (users, stages, trash)
features/admin/importWizard/importApi.ts      /api/import/*
```

To add an endpoint:

1. Add the function to the matching `*Api.ts` (typed request/response, uses the
   shared client). Keep path building — including query strings via
   `toQueryString` from `src/lib/api.ts` — inside the module.
2. Import the shared DTO into `src/types/domain.ts` if it is a new payload
   shape; otherwise reuse existing types.
3. Call the function from the component through `useQuery`/`useMutation`, never
   `api` directly.

### Mock/real parity

MSW handlers mirror the real backend contract. One historical drift was fixed
during this integration: pipeline-stage administration lives on the real
backend at `/api/admin/stages*`, so the MSW admin handlers now intercept those
paths too (they previously used `/api/stages`). Keep the two in sync whenever
the backend contract changes: update the service module **and** the matching
handler under `src/mocks/handlers/`.

## Error handling, loading states, and data fetching

- `useQuery<T>(fetcher, deps)` — mount-time fetch, loading/error/data/refetch.
- `useMutation` — stable `run` for submissions with `loading`, `error`, and
  `reset`. Pages disable submit buttons while `loading` and show errors through
  the shared banner/toast.
- List pages keep `URLSearchParams`-free filter objects; the service layer
  serializes them with `toQueryString`, skipping empty values.
- After a successful mutation, call the same `refresh`/`load`/`onSaved` path the
  UI used before, so mock and real behavior are identical.

## Architecture decisions (summary)

- **Env-gated data source.** Real API is the default; MSW is a dev-only opt-in
  (`VITE_ENABLE_MOCKS=true`). This makes "backend-ready" the path of least
  resistance while preserving a local mock workflow.
- **Same-origin transport + base-URL escape hatch.** The Vite dev proxy keeps
  cookie auth simple and mirrors the production same-origin deployment. The
  base-URL override covers cross-origin environments without changing app code.
- **In-house data hooks instead of a data-fetching library.** The existing
  `useQuery` is small and dependency-free; adding `useMutation` keeps the
  bundle lean for a codebase this size (no react-query/tanstack dependency).
- **MSW excluded from production.** Gating on the statically-replaced
  `import.meta.env.DEV` lets the bundler drop the mock graph, verified by
  checking the production bundle for mock markers.

## Validation

After touching TypeScript in the frontend, run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @custotal/frontend build
```

Then confirm the mock code was not bundled:

```bash
findstr /S /M /C:"custotal-db-v1" packages/frontend/dist
```

No matches means the production bundle is MSW-free. To exercise the real API
locally: start the backend (`pnpm backend:dev`) and the frontend (`pnpm dev`);
to exercise mocks, create a frontend `.env.local` with
`VITE_ENABLE_MOCKS=true` and start `pnpm dev`.
