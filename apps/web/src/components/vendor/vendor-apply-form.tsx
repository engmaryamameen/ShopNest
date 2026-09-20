'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function VendorApplyForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', contactEmail: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.vendorApply({
          name: form.name,
          description: form.description || undefined,
          contactEmail: form.contactEmail,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Application failed');
      }
    });
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Become a ShopNest vendor</h1>
      <p className="text-gray-500 mb-8">
        Apply to sell on ShopNest. An admin reviews every application before you can list products.
      </p>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl border border-gray-200 p-6">
        <div>
          <label htmlFor="vendor-name" className="block text-sm font-medium text-gray-700 mb-1">
            Store name
          </label>
          <input
            id="vendor-name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="vendor-contact-email" className="block text-sm font-medium text-gray-700 mb-1">
            Contact email
          </label>
          <input
            id="vendor-contact-email"
            required
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="vendor-description" className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="vendor-description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </div>
  );
}
