export interface ProductCategory {
  name: string;
  slug: string;
}

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  /** The buy-box VendorOffer's id — what "Add to cart" actually targets,
   * not the canonical product id. Null only for admin-facing views of a
   * product with no active offer yet. */
  offerId?: string | null;
  priceCents: number;
  imageUrl?: string | null;
  stockQuantity: number;
  category?: ProductCategory | null;
  compareAtPriceCents?: number | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
}