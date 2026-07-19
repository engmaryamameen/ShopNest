import { notFound } from 'next/navigation';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  imageUrl?: string | null;
  stockQuantity: number;
  category?: { name: string; slug: string };
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: Product;

  try {
    product = (await api.getProduct(slug)) as Product;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Product image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300">
              <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Product details */}
        <div>
          {product.category && (
            <span className="text-sm text-indigo-600 font-medium uppercase tracking-wide">
              {product.category.name}
            </span>
          )}
          <h1 className="mt-2 text-4xl font-bold text-gray-900">{product.name}</h1>
          <p className="mt-4 text-3xl font-bold text-gray-900">{formatPrice(product.priceCents)}</p>

          <div className="mt-4">
            {product.stockQuantity > 0 ? (
              <span className="text-green-600 text-sm font-medium">
                {product.stockQuantity} in stock
              </span>
            ) : (
              <span className="text-red-500 text-sm font-medium">Out of stock</span>
            )}
          </div>

          <p className="mt-6 text-gray-600 leading-relaxed">{product.description}</p>

          <div className="mt-8">
            <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} />
          </div>
        </div>
      </div>
    </div>
  );
}
