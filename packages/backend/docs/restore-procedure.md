# Backup & Restore Runbook (FR-CC-04)

Custotal runs on PostgreSQL. Backups are full database dumps produced with
`pg_dump` in PostgreSQL custom format (`-Fc`) and kept for 30 days.

## Schedule

Run `node scripts/backup.ts` daily (Task Scheduler / cron). The script:

1. Dumps the database configured by `DATABASE_URL` to `BACKUP_DIR/custotal-<timestamp>.dump`.
2. Prunes dumps older than `BACKUP_RETENTION_DAYS` (default 30).

Example Task Scheduler action (adjust the Node path):

```powershell
node "C:\path\to\custotal\packages\backend\scripts\backup.ts"
```

`pg_dump` must be on `PATH`, or set `PG_DUMP_PATH` (e.g.
`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`) in `packages/backend/.env`.

## Restore Procedure (verified on staging before launch sign-off)

Restores replace the target database. Run them against the intended
`DATABASE_URL` only.

```powershell
cd packages/backend

# 1. Choose the dump to restore (latest by default).
$dump = Get-ChildItem backups\custotal-*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# 2. Drop and recreate the target database so pg_restore starts clean.
& 'C:\Program Files\PostgreSQL\18\bin\pg_dump' --version | Out-Null
$env:PGPASSWORD = '<password>'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS custotal_dev;"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -d postgres -c "CREATE DATABASE custotal_dev;"

# 3. Restore the dump into the fresh database.
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' -U postgres -h localhost -d custotal_dev --no-owner $dump.FullName

# 4. Verify.
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -d custotal_dev -c "SELECT count(*) FROM \"Contact\";"
```

If the service is running, restart it after a restore.

## Test procedure (launch gate)

The acceptance criteria require the restore procedure to be executed and
documented on staging at least once before launch:

1. Run `pnpm --filter @custotal/backend backup` to produce a dump.
2. Drop + recreate a scratch database and restore the dump into it.
3. Compare row counts and spot-check a record between the source and restored
   database.

## Purge (FR-CC-05)

Soft-deleted records are purged after 30 days. The backend schedules this
**in-process**: once it is listening it arms a daily timer that runs the purge at
`MAINTENANCE_PURGE_HOUR:MAINTENANCE_PURGE_MINUTE` (server-local, default 02:00).
Records still referenced by other records are kept, so a blocked record is simply
retried on the next run.
Set `MAINTENANCE_PURGE_ENABLED=false` to disable the timer when an external
scheduler runs `scripts/purge.ts` / `pnpm purge` instead.

The job drains expired candidates in bounded batches (`PURGE_BATCH_SIZE`, default 500) so a large first-run backlog cannot spike memory or hold long locks. It is
safe to re-run: deleting already-removed rows is a no-op.

## Scheduling the backup (launch-blocking)

The purge schedules itself; the **backup is external** because it must run even
when the application is down. Schedule `pnpm backup` once per day:

- **Windows Task Scheduler** — daily trigger running:
  `pnpm --filter @custotal/backend backup` (from the repo root), or
  `pnpm backup` from `packages/backend`.
- **cron** — `0 2 * * * cd /srv/custotal/packages/backend && pnpm backup`.

`pnpm maintenance` still chains backup + purge if you prefer to run both from one
external scheduler — in that case set `MAINTENANCE_PURGE_ENABLED=false` so the
purge is not also run in-process.

Confirm the dump files accumulate in `BACKUP_DIR` and that files older than
`BACKUP_RETENTION_DAYS` (default 30) are pruned.

## Sign-off (launch gate)

The FR-CC-04 acceptance criterion requires the restore test above to be
executed and recorded before launch. Paste the completed record into the launch
checklist:

| Check                                                             | Done | Date | Operator | Notes |
| ----------------------------------------------------------------- | ---- | ---- | -------- | ----- |
| Daily backup scheduled and producing dumps                        | [ ]  |      |          |       |
| In-process purge verified (`MAINTENANCE_PURGE_HOUR`:`MINUTE`)     | [ ]  |      |          |       |
| Restore executed against a scratch/staging database               | [ ]  |      |          |       |
| Row counts and spot-checked record match the source               | [ ]  |      |          |       |
| Restore runbook updated with any deviations found during the test | [ ]  |      |          |       |
