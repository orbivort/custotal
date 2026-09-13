# Contributing to Custotal

Thanks for your interest in improving Custotal. This document explains how to set up the project,
the standards a change must meet, and the review process.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Report bugs and request features using the [issue templates](.github/ISSUE_TEMPLATE).
- Improve documentation (README, `docs/`, inline comments).
- Send a pull request for a bug fix, test improvement, or feature.
- Triage issues, review pull requests, or answer questions in Discussions.

For anything large, **open an issue first** so we can agree on the approach before you invest time.

## Development setup

1. **Prerequisites** — Node `^24.19.0`, pnpm `^11.21.0`, and PostgreSQL `18+`.
2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure the backend** — copy `packages/backend/.env.example` to `packages/backend/.env` and
   set `DATABASE_URL` and `TEST_DATABASE_URL`, then apply migrations:

   ```bash
   pnpm --filter @custotal/backend db:migrate:deploy
   ```

4. **Create an administrator** (there is no registration flow):

   ```bash
   ADMIN_EMAIL=you@example.com pnpm --filter @custotal/backend db:create-admin
   ```

5. **Start developing**

   ```bash
   pnpm dev
   ```

Set `VITE_ENABLE_MOCKS=true` in `packages/frontend/.env.local` to work on the UI without a database.

## Quality gate

Every pull request must pass the same checks CI runs (the `quality` job):

```bash
pnpm typecheck   # frontend then backend
pnpm lint        # ESLint, whole workspace
pnpm lint:css    # Stylelint (CSS/SCSS changes only)
pnpm format:check
pnpm test
```

Run `pnpm lint:fix`, `pnpm lint:css:fix`, or `pnpm format` to fix issues automatically. The project
uses Prettier with single quotes, semicolons, trailing commas, 100-column width, and LF endings.

## API contract parity

A single API contract is expressed in several places. When you change it, update **all** affected
layers in the same pull request:

1. Backend: `packages/backend/prisma/schema.prisma` (+ a migration) and the matching
   `src/services/*-service.ts` / `src/routes/*-routes.ts`.
2. Frontend types: `packages/frontend/src/types/domain.ts`.
3. Frontend service: the matching `packages/frontend/src/features/*/*Api.ts`.
4. MSW mock: the matching `packages/frontend/src/mocks/handlers/*.ts`, including any new query
   parameters.

Service modules are the **only** place allowed to import the HTTP client or write `/api/...` paths.

## Coding standards

- TypeScript is strict (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`). Use
  `import type` for type-only imports and avoid enums/namespaces/parameter properties.
- Backend `src/` and `scripts/` enforce `@typescript-eslint/no-explicit-any` and run
  `eslint-plugin-security`; tests are exempt from the `any` rule.
- Construct API errors with the `errors.*` factories and throw an `Error` subclass (never a literal).
- Backend ESM imports use explicit `.ts` extensions; frontend imports omit extensions.

See [docs/architecture.md](docs/architecture.md) for the full architecture and conventions.

## Testing

The workspace runs Vitest as several projects:

| Tier                  | What it covers                                              |
| --------------------- | ----------------------------------------------------------- |
| `backend-unit`        | Pure logic — no database, no server.                        |
| `backend-integration` | Supertest against the real Express app and a test database. |
| `backend-e2e`         | Black-box HTTP against a real server process.               |
| `frontend`            | jsdom + Testing Library component and unit tests.           |

Add tests for new behavior and update existing tests when behavior changes. A bug fix should come
with a regression test.

## Commits and sign-off

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `build:`, `ci:`, `chore:`.
- Keep commits focused and the history readable.
- Sign off every commit to certify the [Developer Certificate of Origin](https://developercertificate.org/):

  ```bash
  git commit -s -m "fix: prevent stale session on password change"
  ```

  This adds a `Signed-off-by:` trailer using your Git identity.

## Pull requests

1. Fork the repository and create a topic branch from `main` (e.g. `fix/session-timeout`).
2. Make your change, including tests and documentation.
3. Run the [quality gate](#quality-gate) locally.
4. Open a pull request and fill in the template, linking the issue it addresses.

Reviewers aim to respond within a few business days. Please keep pull requests focused — one logical
change per pull request is easier to review and land.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
