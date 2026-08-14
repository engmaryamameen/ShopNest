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

export interface CatalogSourceAdapter {
  fetchProducts(): Promise<SupplierProduct[]>;
}
