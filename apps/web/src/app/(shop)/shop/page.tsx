import { Suspense } from 'react';
import { api } from '@/lib/api';
import { ProductGrid } from '@/components/shop/product-grid';
import { ShopFilters } from '@/components/shop/shop-filters';

interface SearchParams {
  q?: string;
  category?: string;
  brand?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: string;
}

export const dynamic = 'force-dynamic';

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query: Record<string, string | number> = { page: parseInt(params.page ?? '1', 10), limit: 20 };
  if (params.q) query.q = params.q;
  if (params.category) query.category = params.category;
  if (params.brand) query.brand = params.brand;
  if (params.sortBy) query.sortBy = params.sortBy;
  if (params.sortOrder) query.sortOrder = params.sortOrder;

  const [productsData, brands] = await Promise.all([api.listProducts(query), api.listBrands()]);

  function pageHref(page: number): string {
    const p = new URLSearchParams();
    p.set('page', String(page));
    if (params.q) p.set('q', params.q);
    if (params.category) p.set('category', params.category);
    if (params.brand) p.set('brand', params.brand);
    if (params.sortBy) p.set('sortBy', params.sortBy);
    if (params.sortOrder) p.set('sortOrder', params.sortOrder);
    return `?${p.toString()}`;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shop</h1>
        <p className="mt-1 text-gray-500">
          {productsData.total} product{productsData.total !== 1 ? 's' : ''}
          {params.q ? ` matching "${params.q}"` : ''}
        </p>
      </div>

      <Suspense fallback={null}>
        <ShopFilters brands={brands} />
      </Suspense>

      <Suspense fallback={<div>Loading products…</div>}>
        <ProductGrid products={productsData.items} />
      </Suspense>

      {productsData.total > productsData.limit && (
        <div className="mt-8 flex justify-center gap-2">
          {productsData.page > 1 && (
            <a href={pageHref(productsData.page - 1)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Previous
            </a>
          )}
          <span className="px-4 py-2 text-gray-600">
            Page {productsData.page} of {Math.ceil(productsData.total / productsData.limit)}
          </span>
          {productsData.page < Math.ceil(productsData.total / productsData.limit) && (
            <a href={pageHref(productsData.page + 1)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Next
            </a>
          )}
        </div>
      )}
    </div>
  );
}
