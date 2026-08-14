'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { VendorOfferResponse } from '@/lib/api-types';
import { ProductPicker } from './product-picker';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  DRAFT: 'bg-gray-100 text-gray-600',
  INACTIVE: 'bg-red-100 text-red-700',
};

export function VendorOfferList({ offers }: { offers: VendorOfferResponse[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');

  const [form, setForm] = useState({
    productId: '',
    productName: '',
    vendorSku: '',
    priceCents: '',
    stockQuantity: '',
  });

  function resetForm() {
    setForm({ productId: '', productName: '', vendorSku: '', priceCents: '', stockQuantity: '' });
    setShowCreate(false);
    setError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.vendorCreateOffer({
          productId: form.productId,
          vendorSku: form.vendorSku,
          priceCents: Math.round(Number(form.priceCents) * 100),
          stockQuantity: Number(form.stockQuantity),
        });
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create offer');
      }
    });
  }

  function toggleStatus(offer: VendorOfferResponse) {
    const next = offer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    startTransition(async () => {
      try {
        await api.vendorUpdateOffer(offer.id, { status: next });
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Update failed');
      }
    });
  }

  function submitAdjustment(offerId: string) {
    const delta = Number(adjustDelta);
    if (!delta) return;
    startTransition(async () => {
      try {
        await api.vendorAdjustInventory(offerId, {
          delta,
          reason: delta > 0 ? 'RESTOCK' : 'CORRECTION',
        });
        setAdjustingId(null);
        setAdjustDelta('');
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Adjustment failed');
      }
    });
  }

  return (
    <div>
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-6 px-4 py-2 bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 transition-colors"
        >
          + New offer
        </button>
      )}

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">New offer</h2>
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <ProductPicker
                onSelect={(p) => setForm((f) => ({ ...f, productId: p.id, productName: p.name }))}
              />
            </div>
            <div>
              <label htmlFor="offer-vendor-sku" className="block text-sm font-medium text-gray-700 mb-1">
                Your SKU
              </label>
              <input
                id="offer-vendor-sku"
                required
                value={form.vendorSku}
                onChange={(e) => setForm({ ...form, vendorSku: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="offer-price" className="block text-sm font-medium text-gray-700 mb-1">
                Price (USD)
              </label>
              <input
                id="offer-price"
                required
                type="number"
                step="0.01"
                min="0.01"
                value={form.priceCents}
                onChange={(e) => setForm({ ...form, priceCents: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="offer-stock" className="block text-sm font-medium text-gray-700 mb-1">
                Starting stock
              </label>
              <input
                id="offer-stock"
                required
                type="number"
                min="0"
                value={form.stockQuantity}
                onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div className="col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={isPending || !form.productId}
                className="px-6 py-2 bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors"
              >
                {isPending ? 'Creating…' : 'Create offer'}
              </button>
              <button type="button" onClick={resetForm} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {offers.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">No offers yet. Create one to start selling.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offers.map((offer) => (
                <tr key={offer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{offer.product?.name ?? offer.productId}</td>
                  <td className="px-6 py-4 text-xs text-gray-400 font-mono">{offer.vendorSku}</td>
                  <td className="px-6 py-4 text-sm font-medium">{formatPrice(offer.priceCents)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {adjustingId === offer.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={adjustDelta}
                          onChange={(e) => setAdjustDelta(e.target.value)}
                          placeholder="±qty"
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                        <button onClick={() => submitAdjustment(offer.id)} className="text-emerald-700 text-xs font-medium">Save</button>
                        <button onClick={() => setAdjustingId(null)} className="text-gray-400 text-xs">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustingId(offer.id)} className="hover:underline">
                        {offer.stockQuantity}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[offer.status]}`}>
                      {offer.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleStatus(offer)}
                      disabled={isPending}
                      className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
                    >
                      {offer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
