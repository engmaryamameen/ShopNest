'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ProductDetailResponse, PricingSettings } from '@/lib/api-types';
import { AdminInput } from '@/components/ui/admin-form';
import { EditIcon } from '@/components/ui/icons/edit-icon';
export function ProductVariantsEditor({
  product,
  vendorId,
  pricing,
  onSaved,
}: {
  product: ProductDetailResponse;
  vendorId?: string;
  pricing: PricingSettings;
  onSaved: (details: ProductDetailResponse) => void;
}) {
  const [details, setDetails] = useState(product);
  const [editing, setEditing] = useState<string | null>(null),
    [sku, setSku] = useState(''),
    [attributes, setAttributes] = useState('');
  const [price, setPrice] = useState(String(product.priceCents / 100)),
    [stock, setStock] = useState('0');
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setError('');
    setPending(true);
    try {
      const entries = attributes
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const colon = line.indexOf(':');
          if (colon < 1) throw new Error('Write each attribute as Name: Value.');
          return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
        });
      await api.saveProductVariant(product.id, editing, {
        ...pricing,
        vendorId,
        sku: sku || undefined,
        attributes: Object.fromEntries(entries),
        priceCents: Math.round(Number(price) * 100),
        stockQuantity: Number(stock),
      });
      const updated = await api.adminProductDetails(product.id);
      setDetails(updated);
      onSaved(updated);
      setEditing(null);
      setAttributes('');
      setSku('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-6 space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-base font-semibold text-gray-900">Variants</h3>
      <p className="text-xs text-gray-500">
        Manually defined options. The first variant inherits existing direct offers; later variants
        receive their own price and inventory.
      </p>
      <ul className="space-y-1">
        {details.variants?.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
          >
            <span>{v.label}</span>
            <button
              type="button"
              aria-label={`Edit variant ${v.label}`}
              onClick={() => {
                const offer = details.offers.find((o) => o.variantId === v.id);
                setEditing(v.id);
                setAttributes(
                  Object.entries(v.attributes ?? {})
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n'),
                );
                setSku(v.sku ?? '');
                setPrice(String((offer?.priceCents ?? product.priceCents) / 100));
                setStock(String(offer?.stockQuantity ?? 0));
              }}
              className="text-slate-500 hover:text-[#0077b6]"
            >
              <EditIcon />
            </button>
          </li>
        ))}
      </ul>
      <AdminInput
        aria-label="Variant SKU"
        placeholder="Variant SKU (optional)"
        value={sku}
        onChange={(e) => setSku(e.target.value)}
      />
      <label className="block text-sm text-gray-700">
        Attributes (Name: Value, one per line)
        <textarea
          aria-label="Variant attributes"
          value={attributes}
          onChange={(e) => setAttributes(e.target.value)}
          placeholder={'Color: Blue\nSize: M'}
          className="mt-1 min-h-20 w-full rounded-md border border-gray-200 p-2 text-sm focus:border-[#0077b6] focus:outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-700">
          Price (USD)
          <AdminInput
            aria-label="Variant price"
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="text-sm text-gray-700">
          Stock
          <AdminInput
            aria-label="Variant stock"
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending || !attributes.trim()}
        onClick={save}
        className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-[#0077b6] disabled:opacity-50"
      >
        {pending ? 'Saving variant…' : editing ? 'Save variant' : 'Add variant'}
      </button>
      {editing && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setAttributes('');
            setSku('');
          }}
          className="ml-3 text-sm text-gray-500"
        >
          Cancel
        </button>
      )}
    </section>
  );
}
