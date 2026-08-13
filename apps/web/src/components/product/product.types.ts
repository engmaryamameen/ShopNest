export interface ProductCategory {
  name: string;
  slug: string;
}

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  priceCents: number;
  imageUrl?: string | null;
  stockQuantity: number;
  category?: ProductCategory | null;
  compareAtPriceCents?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
}