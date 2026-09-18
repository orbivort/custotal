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

The [README quick start](README.md#quick-start) is the single source of truth for
setup, and has both a POSIX and a Windows PowerShell variant. The steps are
repeated below with the contributor-specific notes; if the two ever diverge, the
README wins.

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

## Release process

Releases are cut by two workflows that hand off to a third, so a release is a reviewable pull request
rather than a command run on someone's laptop:

1. **Prepare** — a maintainer dispatches
   [`Release: prepare`](.github/workflows/release-prepare.yml) with the next SemVer version (for
   example `1.1.0`). It refuses a version whose tag already exists, rewrites `version` in
   `package.json`, `packages/backend/package.json` and `packages/frontend/package.json`, drafts a
   Keep a Changelog entry from the Conventional Commits merged since the previous release tag, pushes
   `release/vX.Y.Z`, and opens a `chore(release): vX.Y.Z` pull request. Notes already staged under
   `## [Unreleased]` in `CHANGELOG.md` are drained into the new entry, so hand-written prose survives.
2. **Review and merge** — edit the changelog on the pull request branch, then merge. **Merging is the
   approval**: nothing is tagged or published before that point.
3. **Finalize and publish** — the merged pull request triggers
   [`Release: finalize`](.github/workflows/release-finalize.yml), which verifies that the merged
   tree really carries the requested version and a matching `## [X.Y.Z]` changelog section, tags the
   merge commit with an annotated `vX.Y.Z`, and drives the
   [`Release`](.github/workflows/release.yml) workflow. That publishes the GitHub Release with notes
   extracted from `CHANGELOG.md` and pushes the `custotal-backend`,
   `custotal-backend:<tag>-tools` and `custotal-frontend` images to GHCR.

A release branch is validated by its own CI run, which starts when the pull request opens and re-runs
on every commit pushed to `release/vX.Y.Z`. Because that pull request is authored by a bot, GitHub
holds its CI and Security runs until a maintainer approves them, so approve each held run as part of
the review. Tagging does not wait for the merge commit's own CI run either: a clean merge changes no
content, so the tagged tree is the one the pull request already validated.

Changes to the release tooling (`.github/workflows/`) go through a pull request like any other change.
Pushing them straight to `main` skips review and the `dependency-review` job, which only runs on pull
requests.

Recovering from a partial or failed release:

- **A failed publish**, such as a failed image build: re-run `Release: finalize`. It is idempotent — an
  existing tag is verified against the merge commit instead of being recreated — and re-drives the
  publish pipeline.
- **A bad draft, or a version that was never merged**: dispatch `Release: prepare` again with the same
  version to rebuild the branch and refresh the pull request. That rebuilds the branch from `base`, so
  edit only through the pull request.
- **Republishing an existing tag**: dispatch the `Release` workflow against the tag — select the tag in
  the "Use workflow from" dropdown, or run `gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z`.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
