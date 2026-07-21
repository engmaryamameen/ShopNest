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

  const [productsData, categories] = await Promise.all([
    api.listProducts(query),
    api.listCategories(),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shop</h1>
        <p className="mt-1 text-gray-500">
          {productsData.total} product{productsData.total !== 1 ? 's' : ''}
          {params.q ? ` matching "${params.q}"` : ''}
        </p>
      </div>

      {/* Search and filter bar */}
      <form method="GET" className="flex gap-3 mb-8">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search products…"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          name="category"
          defaultValue={params.category}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All categories</option>
          {(categories as Array<{ id: string; name: string; slug: string }>).map((cat) => (
            <option key={cat.id} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
        >
          Search
        </button>
      </form>

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
