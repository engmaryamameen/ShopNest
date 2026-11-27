'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const SORT_OPTIONS = [
  { value: 'createdAt-desc', label: 'Newest' },
  { value: 'priceCents-asc', label: 'Price: low to high' },
  { value: 'priceCents-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
] as const;

export function ShopFilters({ brands }: { brands: Array<{ name: string; slug: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get('sortBy') ?? 'createdAt';
  const sortOrder = searchParams.get('sortOrder') ?? 'desc';
  const brand = searchParams.get('brand') ?? '';
  const sortValue = `${sortBy}-${sortOrder}`;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page'); // any filter change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSortChange(value: string) {
    const [nextSortBy, nextSortOrder] = value.split('-');
    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', nextSortBy);
    params.set('sortOrder', nextSortOrder);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <label htmlFor="shop-sort" className="text-sm text-gray-500">
          Sort
        </label>
        <select
          id="shop-sort"
          value={sortValue}
          onChange={(e) => handleSortChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {brands.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="shop-brand" className="text-sm text-gray-500">
            Brand
          </label>
          <select
            id="shop-brand"
            value={brand}
            onChange={(e) => updateParam('brand', e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
