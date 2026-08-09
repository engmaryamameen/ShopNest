export const CATALOG_SOURCE_ADAPTER = Symbol('CATALOG_SOURCE_ADAPTER');

export type SupplierProduct = {
  externalId: string;
  name: string;
  description: string;
  categoryName: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl?: string;
};

export interface CatalogSourceAdapter {
  fetchProducts(): Promise<SupplierProduct[]>;
}
