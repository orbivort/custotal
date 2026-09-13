# Support

Thanks for using Custotal. Here is where to get help.

## Documentation first

- [README](README.md) — overview, prerequisites, and quick start.
- [Self-hosting guide](docs/self-hosting.md) — configuration, deployment, backups, and upgrades.
- [Architecture](docs/architecture.md) — how the system is put together.
- [API reference](docs/api.md) — REST endpoints and the error envelope.
- [Operations notes](packages/backend/docs/operations-notes.md) — known limitations and deferred
  work.

## Asking a question

Use **[GitHub Discussions](https://github.com/orbivort/custotal/discussions)** for:

- "How do I …?" questions about setup, configuration, or usage.
- Ideas and design discussions that are not yet concrete feature requests.
- Sharing how you run or extend Custotal.

## Reporting a bug or requesting a feature

Open an issue using the [issue templates](.github/ISSUE_TEMPLATE). Please include the version,
environment, and clear reproduction steps for bugs.

## Reporting a security vulnerability

**Never** report security issues publicly. Follow [SECURITY.md](SECURITY.md) for the private
disclosure process.

## What we cannot help with

- Custom feature development or consulting.
- Debugging third-party infrastructure (PostgreSQL, reverse proxies, SMTP providers) outside the
  scope of the documented configuration.
- Issues caused by unsupported versions of Node, pnpm, or PostgreSQL (see the prerequisites in the
  README).

Custotal is maintained by volunteers, so response times may vary. Clear, reproducible reports get
priority.
