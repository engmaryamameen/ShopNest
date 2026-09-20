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
that the command exited zero. This is the same "verify before trusting" discipline applied to every
migration in this project.

## Security headers

`helmet` is applied globally in `main.ts`. Content-Security-Policy is deliberately off — this API
serves JSON almost everywhere; the one HTML response (the Swagger docs page at `/api`, an internal
dev tool) relies on inline scripts a default CSP would block. Every other helmet header (HSTS,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-DNS-Prefetch-Control`) is on by
default. CORS stays a separate, already-existing mechanism (`app.enableCors`, origin locked to
`WEB_URL`) — helmet and CORS solve different problems and neither substitutes for the other.

## Dependency scanning

Already continuous, not a Phase 8 addition: `.github/workflows/ci.yml`'s `audit` job runs
`pnpm audit --audit-level=high` on every push and pull request against `main`. A high-or-critical
advisory fails the build before it can merge.

## Media storage

`MediaStorageProvider` (`src/media/`) is a real interface with one adapter,
`LocalMediaStorageAdapter` — no object-storage bucket credentials are available in this environment,
the same documented constraint as the payment gateway (`DECISIONS.md`). Uploaded files land under
`MEDIA_UPLOAD_DIR` (default `uploads/`, gitignored) and are served back at `/uploads/*`. Swapping in
a real bucket later means writing one more class implementing `MediaStorageProvider` and pointing
`MEDIA_PROVIDER` at it — the controller, the upload endpoint, and every caller of `uploadMedia()` on
the frontend stay unchanged.

## Monitoring — scoped honestly, not fabricated

This environment has no real alerting/metrics infrastructure (no Prometheus, no PagerDuty) to wire
up, and standing up fake integrations nobody can receive an alert from would be worse than not
claiming the capability. What's real today:

- Structured, redacted request/response logging via `nestjs-pino` (already existed) — every request
  gets a correlation-friendly structured log line, sensitive fields redacted.
- `GET /health` — liveness/readiness for orchestrators (already existed; used by `docker-compose.yml`'s
  healthcheck and would back a Kubernetes probe identically).
- Catalog import job health is already durable and queryable, not just logged: `CatalogImportRun` rows
  carry `status`/`attemptCount`/`errorMessage`/timestamps, exposed at `GET /admin/catalog-imports` —
  an actual metrics/alerting pipeline would poll or subscribe to this table rather than needing new
  instrumentation.

If real alerting is needed later, the natural next step is shipping the existing Pino JSON logs to
whatever log platform is available (Datadog, CloudWatch, Loki — all ingest structured JSON directly,
no application change required) and alerting on log patterns, rather than adding a bespoke metrics
system now that nothing in this environment can consume.
