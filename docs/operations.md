# Operations

## Backup and restore (PostgreSQL)

The database service is `db` in `docker-compose.yml` (Postgres 17, database `shopnest_dev`, user
`shopnest`), backed by the `pg_data` named volume. Two ways to take a backup, both safe to run
against a live database (no downtime):

**Logical backup (`pg_dump`) — recommended.** Portable across Postgres versions, restorable into a
differently-named database, and what this project's own migration-verification workflow already
uses (see `DECISIONS.md`'s Phase 2 section).

```bash
docker compose exec -T db pg_dump -U shopnest -Fc -d shopnest_dev > shopnest_backup_$(date +%Y%m%d).dump
```

Restore into a fresh database:

```bash
docker compose exec -T db createdb -U shopnest shopnest_restored
docker compose exec -T db pg_restore -U shopnest -d shopnest_restored < shopnest_backup_20260101.dump
```

**Volume snapshot** — a full binary copy of `pg_data`, faster for large databases but ties the
backup to the exact Postgres major version and this specific volume layout:

```bash
docker compose stop db   # -Fc above doesn't need this; a raw volume copy does, for consistency
docker run --rm -v shop-nest_pg_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/pg_data_$(date +%Y%m%d).tar.gz -C /data .
docker compose start db
```

**Recovery drill**: periodically restore the latest backup into a scratch database (`shopnest_restored`
above) and run `prisma migrate status` against it — confirms the backup is actually usable, not just
that the command exited zero. Do this before relying on the backup.

## Security headers

`helmet` is applied globally in `main.ts`. Content-Security-Policy is deliberately off — this API
serves JSON almost everywhere; the one HTML response (the Swagger docs page at `/api`, an internal
dev tool) relies on inline scripts a default CSP would block. Every other helmet header (HSTS,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-DNS-Prefetch-Control`) is on by
default. CORS stays a separate, already-existing mechanism (`app.enableCors`, origin locked to
`WEB_URL`) — helmet and CORS solve different problems and neither substitutes for the other.

## Dependency scanning

The GitHub Actions audit jobs for `main` and `develop` run `pnpm audit --audit-level=high`. Review the findings and their dependency paths before deployment.

## Media storage

`MediaStorageProvider` (`src/media/`) is a real interface with one adapter,
`LocalMediaStorageAdapter` — no object-storage bucket credentials are available in this environment,
the same documented constraint as the payment gateway (`DECISIONS.md`). Uploaded files land under
`MEDIA_UPLOAD_DIR` (default `uploads/`, gitignored) and are served back at `/uploads/*`. Swapping in
a real bucket later means writing one more class implementing `MediaStorageProvider` and pointing
`MEDIA_PROVIDER` at it — the controller, the upload endpoint, and every caller of `uploadMedia()` on
the frontend stay unchanged.

## Monitoring

No alerting or metrics service is configured. Available diagnostics:

- Structured, redacted request/response logging via `nestjs-pino` — every request
  gets a correlation-friendly structured log line, sensitive fields redacted.
- `GET /health` — checks API availability and database connectivity.
- Catalog import job status is stored in the database: `CatalogImportRun` rows
  carry `status`/`attemptCount`/`errorMessage`/timestamps, exposed at `GET /admin/catalog-imports` —
  an actual metrics/alerting pipeline would poll or subscribe to this table rather than needing new
  instrumentation.

Configure a log destination and alerts for the target deployment environment before relying on them.
