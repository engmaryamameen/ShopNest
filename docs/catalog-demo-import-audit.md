# Demo catalog import audit

Historical pre-implementation assessment: 25 November 2026. Findings below describe the original code and are retained as context. Current implementation, performance and resolved migration history are documented in [catalog-background-sync.md](catalog-background-sync.md); current source capabilities are in [catalog-source-assessment.md](catalog-source-assessment.md).

## Decision

Keep the existing external-import guard in place. Build a manual demo importer around sources and assets whose use is permitted in the target environment. The historical Amazon dataset is useful to study enrichment quality, but neither the dataset's availability nor local test use establishes the right to copy or publicly display its product text or photographs. Public deployments and commercial reuse need explicit rights for the data and images. Do not ingest reviews, reviewer identifiers, ratings, review images, or related personal information. An admin-only feature is not a licence.

## Historical Amazon metadata

This adapter reads **Amazon Reviews 2023 historical metadata files**, not the Amazon Creators API. The [dataset authors' category table](https://amazon-reviews-2023.github.io/) lists approximately 48.19 million items across 33 domains for interactions through September 2023. Their item counts are derived from reviews rather than metadata files; some items have no metadata, categories can overlap, and counts are not a guarantee of available or reusable catalog entries.

| Dataset group | Approx. items |
| --- | ---: |
| All Beauty | 112.6k |
| Amazon Fashion | 825.9k |
| Appliances | 94.3k |
| Arts, Crafts and Sewing | 801.3k |
| Automotive | 2.0m |
| Baby Products | 217.7k |
| Beauty and Personal Care | 1.0m |
| Books | 4.4m |
| CDs and Vinyl | 701.7k |
| Cell Phones and Accessories | 1.3m |
| Clothing, Shoes and Jewelry | 7.2m |
| Digital Music | 70.5k |
| Electronics | 1.6m |
| Gift Cards | 1.1k |
| Grocery and Gourmet Food | 603.2k |
| Handmade Products | 164.7k |
| Health and Household | 797.4k |
| Health and Personal Care | 60.3k |
| Home and Kitchen | 3.7m |
| Industrial and Scientific | 427.5k |
| Kindle Store | 1.6m |
| Magazine Subscriptions | 3.4k |
| Movies and TV | 747.8k |
| Musical Instruments | 213.6k |
| Office Products | 710.4k |
| Patio, Lawn and Garden | 851.7k |
| Pet Supplies | 492.7k |
| Software | 89.2k |
| Sports and Outdoors | 1.6m |
| Subscription Boxes | 641 |
| Tools and Home Improvement | 1.5m |
| Toys and Games | 890.7k |
| Video Games | 137.2k |
| Unknown | 13.2m |

The project documents 33 domains and also lists an Unknown grouping. The table is the authors' published grouping and counts, not a distinct hierarchy or additive total. The current adapter scans only 12 hardcoded groups. Metadata contains `main_category`, an optional `categories` array, and product `details`; no separately verified complete subcategory tree, stable subcategory IDs or per-subcategory counts was found. A bounded, locally cached index of the records actually scanned can provide discovered labels/counts, clearly marked as a sample, but cannot claim complete source coverage.

Common fields observed in metadata samples: `parent_asin`, `title`, `main_category`, `categories`, `store`, `description`, `features`, `details`, `images`, `price`, `videos`, `bought_together`, `average_rating`, `rating_number`. Only an explicit allowlist of product fields should be retained. `store` should not automatically be treated as a verified manufacturer brand. `parent_asin` can identify a product family; it does not establish actual available SKU variants, variant attributes or variant images. The adapter currently ignores `categories` and `details`, uses a title-derived description if none exists, and prefers each image's `hi_res`, `large`, then `thumb` URL without verifying actual dimensions or rights. Do not use dataset prices as live prices or infer stock.

### Bounded exploratory sample

Read only the first 20 JSONL metadata records from each category's gzip stream on the [dataset authors' server](https://amazon-reviews-2023.github.io/), stopping the connection after the sample. This is a convenience sample of the start of each file, **not representative** of the dataset. We tested only the first two chosen image URLs per group; a listed image is not necessarily downloadable or high resolution. No review files were read.

| Group | Records with ≥1 image entry | Records with ≥3 image entries | Non-empty description | Non-empty features | Non-empty details | Non-empty categories | Two tested image dimensions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Electronics | 20/20 | 16/20 | 14/20 | 17/20 | 20/20 | 20/20 | 423×366, 912×420 |
| Home and Kitchen | 20/20 | 15/20 | 8/20 | 19/20 | 20/20 | 20/20 | 724×1087, 1500×1500 |
| All Beauty | 20/20 | 11/20 | 6/20 | 5/20 | 19/20 | 0/20 | 500×500, 1500×1500 |

We did not validate whether descriptions were meaningful, whether image entries were duplicates, how many image URLs were broken across the sample, or whether genuine saleable variants were present. Further measurements need a documented, bounded sampling method across files and positions, not just the first records. Do not store copyrighted photos as repository fixtures. The earlier attempted `datarepo.eng.ucsd.edu` URL returned 404; the dataset's current documented `mcauleylab.ucsd.edu` gzip links worked. ShopNest's configured Hugging Face Electronics URL returned HTTP 200, but an entire import was not run.

## Other candidates

- **Open Food Facts:** viable grocery candidate for suitable demo environments if its ODbL/database-content and image CC BY-SA obligations are met; product data and image rights must be considered separately. Its taxonomy can be downloaded and includes multi-parent categories; product completeness varies. [API and licences](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/).
- **Open Icecat:** product specifications and brand content may be better for electronics, but registration and source/asset rights must be verified, especially high-resolution images. [Open catalog](https://icecat.com/content-subscription/).
- **Authorized supplier sample feeds:** often better for realistic variants and multiple images if the owner grants the necessary local and public-demo rights; no specific feed has been supplied or assessed.
- **DummyJSON:** useful deterministic test fixtures, not a rich normal demo catalog. Keep for automated tests; remove from the normal import picker when the replacement is ready.
- Synthetic products/images with explicit provenance remain the clearest choice for public demos where third-party rights are unresolved. Distinguish any generated prices, inventory or variants from source metadata.

## Existing architecture and data risks

`CatalogImportController` authorizes admin access, creates queued runs and calls the worker immediately. The worker claims a run using a database lease and `SKIP LOCKED`, retries failures with backoff, and can reclaim expired work. The service commits batches and records `processedCount` checkpoints and counters. The scheduler can enqueue recurring DummyJSON runs; both periodic scheduler and worker are disabled by default, and `app.catalogImportEnabled` is currently true only in test mode with explicit `CATALOG_IMPORT_TEST_ENABLED=true`. Import UI history refresh is a display polling mechanism, not an external sync.

- **Remove, after tests and queued-run migration policy:** recurring DummyJSON scheduler and its scheduling configuration; a manual demo action does not need periodic imports. Do not delete queued records or change migration history.
- **Simplify cautiously:** ongoing worker polling and complex retry/lease handling are candidates for replacement with explicit per-run execution if bounded jobs finish reliably. A server restart, failed request, process crash, concurrent admins and partial batch must still leave an honest run state. Existing controller currently depends on `poll()`, and integration tests explicitly cover lease reclaim; removing polling without a replacement would strand queued/retry jobs. Measure runtime first. A small background job may remain warranted.
- **Keep:** admin authorization, explicit non-production gate, bounded streams, run history/progress, source IDs, validation, transactional writes, and failure handling.
- **Fix before enabling:** imported products are currently updated by source checksum, overwriting changed descriptions/categories/images, including manual changes, and extra images are deleted on resync. The system-vendor offer path can create or update prices and stock. Source-ID uniqueness does not detect cross-source or manual duplicates. Every incoming product should be a draft; imported source fields and vendor offers must remain separate.
- Existing `Category` has one parent and globally unique name/slug. `Product` has one category, ordered `ProductMedia`, category-specific attribute definitions and variants; `ProductVariant` has no image relationship and `ProductSource` has source/external ID/checksum but no field ownership or image licence. `VendorOffer` already separates price and stock. Schema changes must be justified and have a tested non-destructive path; no such migration is proposed as safe yet.
- The Amazon adapter fetches every hardcoded group before applying category scope and max records. It buffers incomplete JSONL lines without an explicit size bound, follows configured URLs, and partially succeeds when categories fail. Its count and preview refer to fetched records, not the whole dataset. HTTP timeout, cancellation, decompression and image URL validation require focused tests. Image count is merely URL count; no dimensions, duplicates or availability are verified.

## Proposed implementation sequence

1. Document permitted sources and environments; remove unsupported entries from the normal picker, enforce the same source/environment policy on the server, and keep prior run history readable.
2. Preserve existing run records and snapshot the current database. Remove the scheduler only after tests establish what happens to queued and leased runs. Decide whether a bounded manual worker with restart recovery is sufficient based on measured import duration.
3. Implement a preview that returns bounded sampled records, source/provenance, real image metadata, per-record missing fields and duplicate warnings. Do not call source images high resolution until checked. Restrict remote URLs and content size and validate decoded images to avoid unsafe fetches. Cache only within each source's terms.
4. Import only new draft catalog products with explicit source IDs. On repeat, treat an existing source ID as unchanged or require review; never overwrite manual fields, media, variants, or any offer price/stock. Match cross-source identifiers conservatively and flag ambiguous duplicates. Do not create synthetic offers implicitly.
5. Populate category selections from verified source information; label a sampled taxonomy and its counts as such. Preserve OFF's multiple-parent structure in the external view and map to an existing internal category through admin review. Do not silently create categories from strings.
6. Build the compact interface with source/environment labels, selection reset, bounded limits, preview, progress, error/retry, and history. Verify manual operation, authorization, retries, cancellation, refresh, duplicates, manual edit preservation, job restart, and desktop/mobile accessibility against a disposable database.

## Open evidence

Historical Amazon data/image redistribution rights remain unverified. Full subcategory coverage and counts, representative metadata and image-quality distributions, true variants, and public-demo rights are unknown. Other supplier data has not been sampled. The migration issue and existing queued-job preservation still require their own verified non-destructive procedure. These are not reasons to fabricate results or silently enable a source.
