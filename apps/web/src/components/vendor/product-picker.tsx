'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AdminInput } from '@/components/ui/admin-form';
interface PickableProduct {
  id: string;
  name: string;
  slug: string;
  category: { name: string; slug: string } | null;
  variants?: Array<{ id: string; sku: string | null; label: string }>;
}
export function ProductPicker({
  onSelect,
  onClear,
}: {
  onSelect: (product: PickableProduct) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<PickableProduct[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<PickableProduct | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.vendorSearchProducts(query);
        if (!cancelled) setResults(data);
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  if (selected)
    return (
      <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
        <span>{selected.name}</span>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQuery('');
            onClear?.();
          }}
          className="text-[#0077b6]"
        >
          Change
        </button>
      </div>
    );
  return (
    <div className="relative">
      <AdminInput
        aria-label="Search products to sell"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products to sell…"
      />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {loading ? (
            <p role="status" className="p-3 text-sm text-gray-500">
              Searching…
            </p>
          ) : error ? (
            <p role="alert" className="p-3 text-sm text-red-700">
              {error}
            </p>
          ) : !results.length ? (
            <p className="p-3 text-sm text-gray-500">No products found</p>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  setSelected(product);
                  onSelect(product);
                }}
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                {product.name}
                <span className="text-gray-400"> · {product.category?.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
