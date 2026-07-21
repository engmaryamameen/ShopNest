import Image from 'next/image';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl?: string | null;
  category?: { name: string; slug: string };
  stockQuantity: number;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ProductGrid({ products }: { products: Product[] }) {
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
        <Link
          key={product.id}
          href={`/products/${product.slug}`}
          className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="relative aspect-square bg-gray-100">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="p-4">
            {product.category && (
              <span className="text-xs text-indigo-600 font-medium uppercase tracking-wide">
                {product.category.name}
              </span>
            )}
            <h3 className="mt-1 font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
              {product.name}
            </h3>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-lg font-bold text-gray-900">{formatPrice(product.priceCents)}</span>
              {product.stockQuantity === 0 && (
                <span className="text-xs text-red-500 font-medium">Out of stock</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
