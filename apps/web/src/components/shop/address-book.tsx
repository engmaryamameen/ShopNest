'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { AddressResponse } from '@/lib/api-types';

const EMPTY_FORM = { label: '', fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '', phone: '' };

export function AddressBook({ addresses }: { addresses: AddressResponse[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.createAddress({
          ...form,
          label: form.label || undefined,
          line2: form.line2 || undefined,
          state: form.state || undefined,
          phone: form.phone || undefined,
        });
        setForm(EMPTY_FORM);
        setShowForm(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save address');
      }
    });
  }

  function setDefault(id: string) {
    startTransition(async () => {
      try {
        await api.setDefaultAddress(id);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not set default');
      }
    });
  }

  function remove(id: string) {
    if (!confirm('Remove this address?')) return;
    startTransition(async () => {
      try {
        await api.removeAddress(id);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not remove address');
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
          + Add address
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-8 grid grid-cols-2 gap-4">
          {error && (
            <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div className="col-span-2">
            <label htmlFor="addr-label" className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
            <input id="addr-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Home, Work…" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label htmlFor="addr-name" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input id="addr-name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label htmlFor="addr-line1" className="block text-sm font-medium text-gray-700 mb-1">Address line 1</label>
            <input id="addr-line1" required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label htmlFor="addr-line2" className="block text-sm font-medium text-gray-700 mb-1">Address line 2 (optional)</label>
            <input id="addr-line2" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="addr-city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input id="addr-city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="addr-state" className="block text-sm font-medium text-gray-700 mb-1">State (optional)</label>
            <input id="addr-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="addr-postal" className="block text-sm font-medium text-gray-700 mb-1">Postal code</label>
            <input id="addr-postal" required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="addr-country" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input id="addr-country" required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label htmlFor="addr-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input id="addr-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="col-span-2 flex gap-3">
            <button type="submit" disabled={isPending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {isPending ? 'Saving…' : 'Save address'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null); }}
              className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 ? (
        <p className="text-gray-500">No saved addresses yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div key={addr.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  {addr.label && <p className="text-xs font-medium text-gray-500 uppercase">{addr.label}</p>}
                  <p className="font-medium text-gray-900">{addr.fullName}</p>
                </div>
                {addr.isDefault && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Default</span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}<br />
                {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.postalCode}<br />
                {addr.country}
              </p>
              <div className="mt-4 flex gap-3">
                {!addr.isDefault && (
                  <button onClick={() => setDefault(addr.id)} disabled={isPending} className="text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                    Set as default
                  </button>
                )}
                <button onClick={() => remove(addr.id)} disabled={isPending} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
