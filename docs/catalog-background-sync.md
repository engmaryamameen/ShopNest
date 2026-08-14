# Catalog import

ShopNest's catalog is admin-curated by default — products are created and edited by hand through the
admin UI, which can also point at any image URL uploaded via the media endpoint. Real supplier feeds
exist as an optional, manually-triggered way to seed or enrich the catalog, never as a storefront
dependency and never as something that runs on its own.

## Sources

Each source implements the same `CatalogSourceAdapter` interface (`fetchProducts()` → normalized
`SupplierProduct[]`); `CatalogSourceRegistry` resolves a `CatalogSource` enum value to its adapter, so
`CatalogImportService` is written once against the interface, not once per supplier.

- **DummyJSON** (`DUMMY_JSON`) — general merchandise, includes price and stock. A new product imports
  with a real `VendorOffer` (system vendor) and publishes immediately. Carries a real image gallery
  (`images[]`), written as one `ProductMedia` row per image, not just the first.
- **Open Food Facts** (`OPEN_FOOD_FACTS`) — groceries, open and keyless (world.openfoodfacts.org).
  Carries no commercial data at all — no price, no stock. A new product from this source is created
  `DRAFT` with no `VendorOffer`; an admin prices and publishes it by hand through the product-edit
  form, same as a manually-created product. Scoped to a fixed set of real, populated grocery category
  tags (this supplier has no "list everything" endpoint — its catalog is millions of products
  worldwide) — see `GROCERY_CATEGORIES` in `open-food-facts.adapter.ts`. Its public API is genuinely
  flaky under rapid sequential requests (observed live: roughly half of back-to-back category
  searches intermittently 503); each category is retried a few times with backoff and, if it still
  fails, skipped rather than aborting the whole run — one category's outage has no bearing on the
  others, since each is an independent search, not a page of one resource.
- **Amazon** (`AMAZON`) — real catalog metadata from the McAuley Lab "Amazon Reviews 2023" dataset,
  hosted on Hugging Face (open, keyless). No search API and no "everything" feed — each of a fixed
  set of categories is a separate JSONL file, some 100MB+, so the adapter streams each one and stops
  reading (cancelling the connection, not downloading the rest) once it has enough valid records.
  Carries several real images per product — every one is written to `ProductMedia`, not just the
  first. Most records have no usable price (`null` or `0`, both treated as absent), so — like Open
  Food Facts — most imports land `DRAFT` and offer-less; the small fraction that do carry a real price
  publish immediately, same as any other priced import. There's no inventory/stock concept in a
  static dataset at all, so stock is never set regardless of price.

## Runtime flow

1. An admin queues a run from `/admin/imports`, or the scheduler does (only if re-enabled — see below).
2. A worker claims one eligible run with `FOR UPDATE SKIP LOCKED` and writes a lease.
3. The chosen source's adapter fetches and validates the complete response.
4. The import service normalizes money (when present), categories, inventory, and image URLs.
5. Canonical products and supplier mappings are written transactionally to PostgreSQL, batched and
   checkpointed so a crash/retry resumes rather than restarting.
6. Storefront reads use only PostgreSQL and continue to work during supplier outages.

Failed work is retried three times with exponential backoff. A run abandoned by a crashed worker
becomes claimable after its lease expires. The partial unique database index permits only one queued
or running synchronization per supplier, including when multiple application replicas schedule at
the same time.

A re-sync never overwrites a product's `publishStatus` once it exists — that's admin-owned from
creation onward, so re-running an Open Food Facts sync can't silently demote a product an admin has
since priced and published.

## Operational controls

- `CATALOG_SCHEDULE_ENABLED=false` (default) disables automatic scheduling entirely — off because the
  catalog is admin-curated, not supplier-driven. If re-enabled, the scheduler only ever queues
  DummyJSON runs; Open Food Facts stays manual-only (see `catalog-import.scheduler.ts`).
- `CATALOG_SCHEDULE_INTERVAL_MS` controls the recurring interval when enabled (default: six hours).
- `CATALOG_WORKER_ENABLED=false` (default) disables execution in this process, allowing a dedicated
  worker deployment. The manual "Preview"/"Run synchronization" buttons still work when this is off —
  they queue a run for whichever worker process picks it up.
- `CATALOG_WORKER_POLL_MS` controls claim frequency (default: two seconds).
- `CATALOG_WORKER_LEASE_SECONDS` controls crash recovery (default: five minutes).
- `OPEN_FOOD_FACTS_URL`, `OPEN_FOOD_FACTS_TIMEOUT_MS`, `OPEN_FOOD_FACTS_PAGE_SIZE` configure the Open
  Food Facts adapter specifically.
- `AMAZON_CATALOG_URL`, `AMAZON_CATALOG_TIMEOUT_MS`, `AMAZON_CATALOG_PER_CATEGORY_LIMIT` configure the
  Amazon adapter specifically — the limit bounds how many records it reads from each category file
  before moving on, not a page size (there's no pagination, only a byte stream to read further into
  or stop).

Admins enqueue a run with `POST /admin/catalog-imports/run` (`{ source, categoryScope?, maxRecords?,
minImageCount? }`), preview one without writing anything via `POST /admin/catalog-imports/preview`
(same body shape), and inspect recent runs with `GET /admin/catalog-imports`. Enqueue returns `202
Accepted`; completion is asynchronous.
