# Catalog background synchronization

ShopNest treats DummyJSON as an upstream supplier feed, never as a storefront dependency.

## Runtime flow

1. The scheduler inserts a durable `CatalogImportRun` in `QUEUED` state on startup and every six hours.
2. A worker claims one eligible run with `FOR UPDATE SKIP LOCKED` and writes a lease.
3. The supplier adapter fetches every page with a timeout and validates the complete response.
4. The import service normalizes money, categories, inventory, and image URLs.
5. Canonical products and supplier mappings are written transactionally to PostgreSQL.
6. Storefront reads use only PostgreSQL and continue to work during supplier outages.

Failed work is retried three times with exponential backoff. A run abandoned by a crashed worker
becomes claimable after its lease expires. The partial unique database index permits only one queued
or running synchronization per supplier, including when multiple application replicas schedule at
the same time.

## Operational controls

- `CATALOG_SCHEDULE_ENABLED=false` disables automatic scheduling.
- `CATALOG_SCHEDULE_INTERVAL_MS` controls the recurring interval (default: six hours).
- `CATALOG_WORKER_ENABLED=false` disables execution in a process, allowing a dedicated worker deployment.
- `CATALOG_WORKER_POLL_MS` controls claim frequency (default: two seconds).
- `CATALOG_WORKER_LEASE_SECONDS` controls crash recovery (default: five minutes).

Admins may enqueue a run with `POST /admin/catalog-imports/dummy-json` and inspect recent runs with
`GET /admin/catalog-imports`. Enqueue returns `202 Accepted`; completion is asynchronous.
