export type SupplierProduct = {
  externalId: string;
  name: string;
  description: string;
  categoryName: string;
  brand?: string;
  /** Absent when the supplier carries no commercial data (e.g. Open Food
   * Facts — a public food-facts database, not a marketplace). The service
   * still creates the canonical Product in that case, just DRAFT and
   * offer-less, for an admin to price and publish. */
  priceCents?: number;
  stockQuantity?: number;
  /** The primary image — always the first entry of `imageUrls` when that's
   * present. Kept as its own field so a single-image source (DummyJSON,
   * Open Food Facts) doesn't need to wrap one URL in an array. */
  imageUrl?: string;
  /** Every image the supplier listed, in display order — written to
   * `ProductMedia` as one row per index. Absent/empty for a source that
   * only ever carries one image; present for a source like Amazon's
   * catalog metadata, which lists several real angles per product. */
  imageUrls?: string[];
  /** How many images the supplier listed for this product. Used by the
   * admin `minImageCount` import-scope filter. */
  imageCount: number;
};

export interface FetchProductsResult {
  products: SupplierProduct[];
  /** Records the supplier returned that failed structural validation
   * (missing/malformed required fields) — permanently invalid, not a
   * transient fetch failure, so they're skipped and counted rather than
   * either silently dropped or aborting every other, valid record in the
   * same fetch. */
  skippedCount: number;
}

export interface CatalogSourceAdapter {
  fetchProducts(): Promise<FetchProductsResult>;
}
