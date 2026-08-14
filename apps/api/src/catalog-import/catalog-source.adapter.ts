export const CATALOG_SOURCE_ADAPTER = Symbol('CATALOG_SOURCE_ADAPTER');

export type SupplierProduct = {
  externalId: string;
  name: string;
  description: string;
  categoryName: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl?: string;
  /** How many images the supplier listed for this product — independent of
   * `imageUrl`, which only ever carries the first one (`ProductMedia`
   * storage is a separate, unbuilt concern here). Used by the admin
   * `minImageCount` import-scope filter. */
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
