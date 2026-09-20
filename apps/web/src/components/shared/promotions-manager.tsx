'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';
import type { PromotionResponse, PromotionType } from '@/lib/api-types';

const EMPTY_FORM = {
  code: '',
  type: 'PERCENT' as PromotionType,
  value: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  maxRedemptionsPerUser: '',
  minSubtotalCents: '',
};

interface PromotionsManagerProps {
  promotions: PromotionResponse[];
  /** Which endpoint family to call — the two are otherwise identical. */
  scope: 'vendor' | 'admin';
}

export function PromotionsManager({ promotions, scope }: PromotionsManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createFn = scope === 'vendor' ? api.vendorCreatePromotion : api.adminCreatePromotion;
  const updateFn = scope === 'vendor' ? api.vendorUpdatePromotion : api.adminUpdatePromotion;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createFn({
          code: form.code,
          type: form.type,
          value: Number(form.value),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
          maxRedemptionsPerUser: form.maxRedemptionsPerUser ? Number(form.maxRedemptionsPerUser) : undefined,
          minSubtotalCents: form.minSubtotalCents ? Math.round(Number(form.minSubtotalCents) * 100) : undefined,
        });
        setForm(EMPTY_FORM);
        setShowForm(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create promotion');
      }
    });
  }

  function toggle(id: string, isActive: boolean) {
    startTransition(async () => {
      try {
        await updateFn(id, { isActive });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not update promotion');
      }
    });
  }

  return (
    <div>
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-6 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          + New promotion
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-8 grid grid-cols-2 gap-4">
          {error && <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label htmlFor="promo-code" className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              id="promo-code"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label htmlFor="promo-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              id="promo-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="PERCENT">Percent off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
            </select>
          </div>

          <div>
            <label htmlFor="promo-value" className="block text-sm font-medium text-gray-700 mb-1">
              {form.type === 'PERCENT' ? 'Percent (1-100)' : 'Amount ($)'}
            </label>
            <input
              id="promo-value"
              required
              type="number"
              min={form.type === 'PERCENT' ? 1 : 0.01}
              max={form.type === 'PERCENT' ? 100 : undefined}
              step={form.type === 'PERCENT' ? 1 : 0.01}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="promo-min" className="block text-sm font-medium text-gray-700 mb-1">Minimum order ($, optional)</label>
            <input
              id="promo-min"
              type="number"
              min={0}
              step={0.01}
              value={form.minSubtotalCents}
              onChange={(e) => setForm({ ...form, minSubtotalCents: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="promo-starts" className="block text-sm font-medium text-gray-700 mb-1">Starts</label>
            <input
              id="promo-starts"
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="promo-ends" className="block text-sm font-medium text-gray-700 mb-1">Ends</label>
            <input
              id="promo-ends"
              required
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="promo-max" className="block text-sm font-medium text-gray-700 mb-1">Max redemptions (optional)</label>
            <input
              id="promo-max"
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="promo-max-user" className="block text-sm font-medium text-gray-700 mb-1">Max per customer (optional)</label>
            <input
              id="promo-max-user"
              type="number"
              min={1}
              value={form.maxRedemptionsPerUser}
              onChange={(e) => setForm({ ...form, maxRedemptionsPerUser: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="col-span-2 flex gap-3">
            <button type="submit" disabled={isPending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {isPending ? 'Creating…' : 'Create promotion'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Code</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Discount</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Window</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Redemptions</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {promotions.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4 font-mono text-gray-900">{p.code}</td>
                <td className="px-6 py-4 text-gray-600">
                  {p.type === 'PERCENT' ? `${p.value}%` : formatPrice(p.value)}
                  {p.minSubtotalCents ? ` (min ${formatPrice(p.minSubtotalCents)})` : ''}
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {new Date(p.startsAt).toLocaleDateString()} – {new Date(p.endsAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {p.maxRedemptions ? `limit ${p.maxRedemptions}` : 'no limit'}
                  {p.maxRedemptionsPerUser ? `, ${p.maxRedemptionsPerUser}/customer` : ''}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => toggle(p.id, !p.isActive)}
                    disabled={isPending}
                    className="text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {promotions.length === 0 && <p className="text-center text-gray-500 py-12">No promotions yet.</p>}
      </div>
    </div>
  );
}
