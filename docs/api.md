# API Reference

The Custotal backend exposes a JSON REST API under `/api`. The frontend consumes exactly these
endpoints through its service modules (`packages/frontend/src/features/*/*Api.ts`); there is no
separate private API.

> The Express routers in `packages/backend/src/routes/` are the authoritative source. This page
> summarizes paths, access levels, and cross-cutting conventions.

## Access levels

| Level  | Guard            | Who                                                        |
| ------ | ---------------- | ---------------------------------------------------------- |
| Public | none             | Anyone (health probes, the sign-in screen, stage options). |
| User   | `requireUser`    | Any signed-in user.                                        |
| Editor | `requireCanEdit` | admin, manager, or rep (viewers are read-only).            |
| Admin  | `requireAdmin`   | Administrators only.                                       |

## Conventions

- **Content type:** JSON request and response bodies.
- **Session:** an opaque token in the HttpOnly `ct_session` cookie. Clients send requests with
  credentials; the frontend uses `credentials: 'include'`. The 8-hour idle window slides on activity.
- **CSRF:** state-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) are rejected unless the
  `Origin`/`Referer` matches the request host or a `CORS_ORIGINS` entry. Requests with no such header
  (server-to-server, curl) pass through.
- **Error envelope:** every error is `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- **Concurrency:** updates send the record's `updatedAt`; a stale value returns `409 conflict` with
  the current server record in `details`.
- **Pagination:** list endpoints accept `page` and `pageSize` and return `{ items, total, page, … }`.
- **Rate limits:** login `5/min` per email+IP, password-reset `3/h`, and a general `100/min` per
  route. Exceeding a limit returns `429` with `Retry-After`.

Common status codes: `200` OK, `201` Created, `400` validation error, `401` unauthenticated,
`403` forbidden, `404` not found, `409` conflict, `429` rate limited, `500` server error.

## Meta and health

| Method | Path                 | Level  | Purpose                                           |
| ------ | -------------------- | ------ | ------------------------------------------------- |
| GET    | `/health`            | Public | Database probe → `{ "db": "ok" }`.                |
| GET    | `/api/health`        | Public | Instance identity for the sign-in screen.         |
| GET    | `/api/meta`          | User   | Users and account index used by forms/filters.    |
| GET    | `/api/stages`        | Public | Pipeline stages for option lists.                 |
| POST   | `/api/stages/ensure` | User   | Idempotently ensure the default stage set exists. |

## Authentication

| Method | Path                               | Level  | Purpose                                  |
| ------ | ---------------------------------- | ------ | ---------------------------------------- |
| POST   | `/api/auth/login`                  | Public | Create a session (sets `ct_session`).    |
| POST   | `/api/auth/logout`                 | Public | Invalidate the current session.          |
| GET    | `/api/auth/me`                     | User   | Resolve the current user.                |
| POST   | `/api/auth/password-reset/request` | Public | Request a reset link (anti-enumeration). |
| POST   | `/api/auth/password-reset/confirm` | Public | Complete a reset with a token.           |
| POST   | `/api/auth/invite/accept`          | Public | Accept an invitation with a token.       |
| POST   | `/api/auth/change-password`        | User   | Change password; revokes all sessions.   |

## Contacts

All routes require **User**; writes require **Editor**.

| Method | Path                       | Purpose                                             |
| ------ | -------------------------- | --------------------------------------------------- |
| GET    | `/api/contacts`            | List with search, owner/letter filters, and paging. |
| GET    | `/api/contacts/:id`        | Fetch one contact.                                  |
| POST   | `/api/contacts`            | Create.                                             |
| PATCH  | `/api/contacts/:id`        | Update (expects `updatedAt`).                       |
| DELETE | `/api/contacts/:id`        | Soft delete.                                        |
| GET    | `/api/contacts/:id/export` | Single-contact JSON export (GDPR-lite).             |

List query parameters include `q`, `owner`, `letter`, `sort`, `page`, and `pageSize`; see
`contact-routes.ts` for the authoritative set.

## Accounts

All routes require **User**; writes require **Editor**.

| Method | Path                                 | Purpose                                     |
| ------ | ------------------------------------ | ------------------------------------------- |
| GET    | `/api/accounts`                      | List with search, owner/letter, and paging. |
| GET    | `/api/accounts/:id`                  | Fetch one account.                          |
| POST   | `/api/accounts`                      | Create.                                     |
| PATCH  | `/api/accounts/:id`                  | Update (expects `updatedAt`).               |
| DELETE | `/api/accounts/:id`                  | Soft delete.                                |
| POST   | `/api/accounts/:id/links`            | Link a contact (primary + role).            |
| DELETE | `/api/accounts/:id/links/:contactId` | Remove a contact link (record preserved).   |

## Interactions

All routes require **User**; writes require **Editor**.

| Method | Path                    | Purpose                                                      |
| ------ | ----------------------- | ------------------------------------------------------------ |
| GET    | `/api/interactions`     | Timeline for a `contactId`, `accountId`, or `opportunityId`. |
| POST   | `/api/interactions`     | Create.                                                      |
| PATCH  | `/api/interactions/:id` | Update (author/manager/admin scoping applies).               |
| DELETE | `/api/interactions/:id` | Soft delete.                                                 |

## Opportunities (pipeline)

All routes require **User**; writes require **Editor**.

| Method | Path                           | Purpose                                              |
| ------ | ------------------------------ | ---------------------------------------------------- |
| GET    | `/api/opportunities`           | List (owner/stage filters, paging).                  |
| GET    | `/api/opportunities/:id`       | Fetch one opportunity.                               |
| POST   | `/api/opportunities`           | Create.                                              |
| PATCH  | `/api/opportunities/:id`       | Update (expects `updatedAt`).                        |
| DELETE | `/api/opportunities/:id`       | Soft delete.                                         |
| POST   | `/api/opportunities/:id/stage` | Move stage; records history and updates probability. |

## Tasks

All routes require **User**; writes require **Editor**.

| Method | Path                         | Purpose                                  |
| ------ | ---------------------------- | ---------------------------------------- |
| GET    | `/api/tasks/summary`         | Counts for the header badge.             |
| GET    | `/api/tasks`                 | List (my/all, filters, sorting, paging). |
| POST   | `/api/tasks`                 | Create.                                  |
| PATCH  | `/api/tasks/:id`             | Update (expects `updatedAt`).            |
| DELETE | `/api/tasks/:id`             | Soft delete.                             |
| POST   | `/api/tasks/:id/complete`    | Complete (records completed-at/by).      |
| POST   | `/api/tasks/:id/reopen`      | Reopen.                                  |
| GET    | `/api/tasks/:id/completions` | Completion history.                      |

## Reports

Require **User**; results are owner-scoped for representatives.

| Method | Path                    | Purpose                                            |
| ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/api/reports/pipeline` | Pipeline-by-stage: counts, totals, weighted value. |
| GET    | `/api/reports/winloss`  | Win/loss totals including loss reasons.            |

## Search

| Method | Path          | Level | Purpose                                                         |
| ------ | ------------- | ----- | --------------------------------------------------------------- |
| GET    | `/api/search` | User  | Grouped global search across contacts, accounts, opportunities. |

## Admin

All routes require **Admin** (anonymous callers get `401`; signed-in non-admins get `403`).

### Users

| Method | Path                   | Purpose                                      |
| ------ | ---------------------- | -------------------------------------------- |
| GET    | `/api/admin/users`     | List users.                                  |
| POST   | `/api/admin/users`     | Create a user (invite / temporary password). |
| PATCH  | `/api/admin/users/:id` | Update role, name, or status.                |
| DELETE | `/api/admin/users/:id` | Remove a user.                               |

### Pipeline stages

| Method | Path                        | Purpose                                        |
| ------ | --------------------------- | ---------------------------------------------- |
| POST   | `/api/admin/stages`         | Create a stage.                                |
| PATCH  | `/api/admin/stages/:id`     | Rename or edit a stage.                        |
| DELETE | `/api/admin/stages/:id`     | Delete a stage (blocked with `409` if in use). |
| POST   | `/api/admin/stages/reorder` | Reorder stages (`{ orderedIds }`).             |

### Trash and recovery

| Method | Path                                    | Purpose                     |
| ------ | --------------------------------------- | --------------------------- |
| GET    | `/api/admin/trash`                      | List soft-deleted records.  |
| POST   | `/api/admin/trash/{entity}/:id/restore` | Restore a record.           |
| DELETE | `/api/admin/trash/{entity}/:id`         | Permanently purge a record. |

`{entity}` is one of `contacts`, `accounts`, `opportunities`, `tasks`, `interactions`.

## CSV import

All routes require **Admin**. `/api/import/*` accepts request bodies up to 12 MB.

| Method | Path                        | Purpose                                              |
| ------ | --------------------------- | ---------------------------------------------------- |
| GET    | `/api/import/templates`     | List saved mapping templates (`?entity=`).           |
| POST   | `/api/import/templates`     | Save a mapping template.                             |
| DELETE | `/api/import/templates/:id` | Delete a template.                                   |
| POST   | `/api/import/dry-run`       | Validate rows and report duplicates without writing. |
| POST   | `/api/import/commit`        | Commit the import with a duplicate policy.           |
