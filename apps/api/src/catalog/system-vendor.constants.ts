/** The platform-operated vendor every admin-authored and imported product
 * is listed under. Shared by CatalogService and CatalogImportService — both
 * need to resolve the same row, so the identifying slug lives in one place.
 * `prisma/backfill-vendor-offers.ts` keeps its own copy of this constant:
 * it's a standalone script outside the Nest DI graph (run once, directly
 * with `node`, not through the application), so importing application code
 * into it would be an odd dependency direction for a one-time migration
 * tool — the string is trivial enough that duplicating it there is the
 * simpler choice. */
export const SYSTEM_VENDOR_SLUG = 'shopnest-direct';
export const SYSTEM_VENDOR_NAME = 'ShopNest Direct';
