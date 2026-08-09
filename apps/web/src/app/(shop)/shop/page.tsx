import { Suspense } from 'react';
import { api } from '@/lib/api';
import { ProductGrid } from '@/components/shop/product-grid';

interface SearchParams {
  q?: string;
  category?: string;
  page?: string;
}

export const dynamic = 'force-dynamic';

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query: Record<string, string | number> = { page: parseInt(params.page ?? '1', 10), limit: 20 };
  if (params.q) query.q = params.q;
  if (params.category) query.category = params.category;

  const productsData = await api.listProducts(query);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shop</h1>
        <p className="mt-1 text-gray-500">
          {productsData.total} product{productsData.total !== 1 ? 's' : ''}
          {params.q ? ` matching "${params.q}"` : ''}
        </p>
      </div>

      <Suspense fallback={<div>Loading products…</div>}>
        <ProductGrid products={productsData.items as Product[]} />
      </Suspense>

      {/* Pagination */}
      {productsData.total > productsData.limit && (
        <div className="mt-8 flex justify-center gap-2">
          {productsData.page > 1 && (
            <a
              href={`?page=${productsData.page - 1}${params.q ? `&q=${params.q}` : ''}${params.category ? `&category=${params.category}` : ''}`}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Previous
            </a>
          )}
          <span className="px-4 py-2 text-gray-600">
            Page {productsData.page} of {Math.ceil(productsData.total / productsData.limit)}
          </span>
          {productsData.page < Math.ceil(productsData.total / productsData.limit) && (
            <a
              href={`?page=${productsData.page + 1}${params.q ? `&q=${params.q}` : ''}${params.category ? `&category=${params.category}` : ''}`}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Next
            </a>
          )}
        </div>
      )}
    </div>
  );
}

interface Product {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl?: string;
  category?: { name: string; slug: string };
  stockQuantity: number;
}
