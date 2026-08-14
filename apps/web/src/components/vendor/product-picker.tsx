'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface PickableProduct {
  id: string;
  name: string;
  slug: string;
  category: { name: string; slug: string } | null;
}

interface ProductPickerProps {
  onSelect: (product: PickableProduct) => void;
}

/** A search-as-you-type picker over the existing canonical catalog — a
 * vendor offer always sells an existing Product (requesting a brand new
 * canonical product to be created is a deferred admin-review flow, not
 * built here; see the final report). Uses the vendor-scoped search
 * endpoint, not the public product listing — the public one only returns
 * products that already have an active offer, which would hide exactly
 * the products a vendor most wants to find (nobody selling them yet). */
export function ProductPicker({ onSelect }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickableProduct | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await api.vendorSearchProducts(query));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2">
        <span className="text-sm text-gray-900">{selected.name}</span>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQuery('');
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products to sell…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No products found</div>
          )}
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                setSelected(product);
                onSelect(product);
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            >
              {product.name}
              {product.category && <span className="text-gray-400"> · {product.category.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
