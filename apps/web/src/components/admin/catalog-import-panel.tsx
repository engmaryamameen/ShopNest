'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { CatalogSource, ImportPreviewResponse } from '@/lib/api-types';

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  unchanged: 'bg-gray-100 text-gray-600',
};

const SOURCE_OPTIONS: Array<{ value: CatalogSource; label: string; hint: string }> = [
  { value: 'DUMMY_JSON', label: 'DummyJSON', hint: 'General merchandise, with price and stock — offers publish immediately.' },
  {
    value: 'OPEN_FOOD_FACTS',
    label: 'Open Food Facts',
    hint: 'Groceries only — no pricing data, so imports land as drafts for you to price and publish.',
  },
  {
    value: 'AMAZON',
    label: 'Amazon',
    hint: 'Real catalog data with several images per product. Rarely has a usable price, so most imports land as drafts too.',
  },
];

export function CatalogImportPanel() {
  const router = useRouter();
  const [source, setSource] = useState<CatalogSource>('DUMMY_JSON');
  const [categoryScope, setCategoryScope] = useState('');
  const [maxRecords, setMaxRecords] = useState('');
  const [minImageCount, setMinImageCount] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildScope() {
    const categories = categoryScope
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    return {
      source,
      categoryScope: categories.length > 0 ? categories : undefined,
      maxRecords: maxRecords ? Number(maxRecords) : undefined,
      minImageCount: minImageCount ? Number(minImageCount) : undefined,
    };
  }

  function handlePreview() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        setPreview(await api.adminPreviewImport(buildScope()));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Preview failed');
      }
    });
  }

  function handleTrigger() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await api.adminTriggerImport(buildScope());
        setNotice('Synchronization started — see its live progress in the table below.');
        setPreview(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not queue synchronization');
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
      <h2 className="font-semibold text-gray-900 mb-1">Run a catalog synchronization</h2>
      <p className="text-sm text-gray-500 mb-4">
        Pick a supplier, optionally scope the run, then preview what it would do before committing to it. Imports never
        run on their own — this is manual, on demand, additive/idempotent, and never deletes anything.
      </p>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {notice && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {notice}
        </div>
      )}

      <fieldset className="mb-4">
        <legend className="block text-sm font-medium text-gray-700 mb-1">Source</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SOURCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                source === option.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="catalog-import-source"
                value={option.value}
                checked={source === option.value}
                onChange={() => {
                  setSource(option.value);
                  setPreview(null);
                }}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="import-category-scope" className="block text-sm font-medium text-gray-700 mb-1">
            Categories (comma-separated)
          </label>
          <input
            id="import-category-scope"
            value={categoryScope}
            onChange={(e) => setCategoryScope(e.target.value)}
            placeholder={source === 'DUMMY_JSON' ? 'e.g. smartphones, laptops' : 'run Preview first — filter by the exact names it shows'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="import-max-records" className="block text-sm font-medium text-gray-700 mb-1">
            Max records
          </label>
          <input
            id="import-max-records"
            type="number"
            min="1"
            value={maxRecords}
            onChange={(e) => setMaxRecords(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="import-min-images" className="block text-sm font-medium text-gray-700 mb-1">
            Min. images
          </label>
          <input
            id="import-min-images"
            type="number"
            min="0"
            value={minImageCount}
            onChange={(e) => setMinImageCount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={handlePreview}
          disabled={isPending}
          className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Working…' : 'Preview'}
        </button>
        <button
          onClick={handleTrigger}
          disabled={isPending}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Working…' : 'Run synchronization'}
        </button>
      </div>

      {preview && (
        <div className="border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-4 text-sm">
            <div><p className="text-gray-500">Discovered</p><p className="font-semibold text-gray-900">{preview.discoveredCount}</p></div>
            <div><p className="text-gray-500">In scope</p><p className="font-semibold text-gray-900">{preview.scopedCount}</p></div>
            <div><p className="text-gray-500">Would create</p><p className="font-semibold text-green-700">{preview.wouldCreateCount}</p></div>
            <div><p className="text-gray-500">Would update</p><p className="font-semibold text-blue-700">{preview.wouldUpdateCount}</p></div>
            <div><p className="text-gray-500">Unchanged</p><p className="font-semibold text-gray-500">{preview.wouldBeUnchangedCount}</p></div>
            <div><p className="text-gray-500">Invalid (skipped)</p><p className="font-semibold text-amber-700">{preview.skippedCount}</p></div>
          </div>
          {preview.sample.length > 0 && (
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  {preview.sample.map((item) => (
                    <tr key={item.externalId}>
                      <td className="px-3 py-2 text-gray-900">{item.name}</td>
                      <td className="px-3 py-2 text-gray-500">{item.categoryName}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[item.action]}`}>
                          {item.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.scopedCount > preview.sample.length && (
                <p className="text-xs text-gray-400 px-3 py-2">
                  Showing first {preview.sample.length} of {preview.scopedCount} in scope.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
