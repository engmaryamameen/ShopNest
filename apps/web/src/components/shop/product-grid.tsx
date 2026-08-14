import type { ProductCardResponse } from '@/lib/api-types';
import { ProductCard } from '@/components/product/product-card';

export function ProductGrid({ products }: { products: ProductCardResponse[] }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-lg">No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} showCategory />
      ))}
    </div>
  );
}
