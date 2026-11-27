'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format-price';
import type { PromotionResponse, PromotionInput, TaxClass } from '@/lib/api-types';
import { AdminInput, AdminSelect, AdminSwitch } from '@/components/ui/admin-form';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { PricingField } from './offer-pricing-fields';

export function PromotionsManager({
  promotions,
  scope,
}: {
  promotions: PromotionResponse[];
  scope: 'vendor' | 'admin';
}) {
  const router = useRouter();
  const [show, setShow] = useState(false),
    [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    code: '',
    automatic: false,
    type: 'PERCENT',
    value: '10',
    startsAt: '',
    endsAt: '',
    min: '',
    max: '',
    total: '',
    perUser: '',
    target: 'ALL',
  });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [taxName, setTaxName] = useState(''),
    [taxRate, setTaxRate] = useState('');
  useEffect(() => {
    if (scope !== 'admin') return;
    Promise.all([api.adminImportOptions(), api.listBrands(), api.adminProductPage({ limit: 100 })])
      .then(([options, brands, products]) => {
        setTargets({
          PRODUCTS: products.items,
          BRANDS: brands,
          CATEGORIES: options.categories,
          VENDORS: options.vendors,
        });
        setTaxClasses(options.taxClasses);
      })
      .catch((e) => setError(e.message));
  }, [scope]);
  useEffect(() => {
    if (scope !== 'admin' || form.target !== 'PRODUCTS') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .adminProductPage({ q: search, limit: 100 })
        .then((page) => {
          if (!cancelled) setTargets((current) => ({ ...current, PRODUCTS: page.items }));
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scope, form.target, search]);
  function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    start(async () => {
      try {
        if (!form.startsAt || !form.endsAt)
          throw new Error('Choose a start and end date for the promotion.');
        if (new Date(form.endsAt) <= new Date(form.startsAt))
          throw new Error('The end date must be after the start date.');
        const targetField = {
          PRODUCTS: 'productIds',
          BRANDS: 'brandIds',
          CATEGORIES: 'categoryIds',
          VENDORS: 'vendorIds',
          TYPES: 'productTypes',
        }[form.target];
        const body: PromotionInput = {
          code: form.code,
          type: form.type as PromotionInput['type'],
          automatic: form.automatic,
          value:
            form.type === 'PERCENT' ? Number(form.value) : Math.round(Number(form.value) * 100),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          minSubtotalCents: form.min ? Math.round(Number(form.min) * 100) : undefined,
          maxDiscountCents: form.max ? Math.round(Number(form.max) * 100) : undefined,
          maxRedemptions: !form.automatic && form.total ? Number(form.total) : undefined,
          maxRedemptionsPerUser: !form.automatic && form.perUser ? Number(form.perUser) : undefined,
          ...(targetField
            ? {
                [targetField]:
                  form.target === 'TYPES'
                    ? search
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : selected,
              }
            : {}),
        };
        if (form.target !== 'ALL' && form.target !== 'TYPES' && !selected.length)
          throw new Error('Select at least one target.');
        await (scope === 'admin' ? api.adminCreatePromotion : api.vendorCreatePromotion)(body);
        setShow(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create promotion.');
      }
    });
  }
  function toggle(p: PromotionResponse) {
    setError('');
    start(async () => {
      try {
        await (scope === 'admin' ? api.adminUpdatePromotion : api.vendorUpdatePromotion)(p.id, {
          isActive: !p.isActive,
        });
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }
  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mb-4 text-sm text-gray-500">
        Direct discounts apply first, followed by the best automatic promotion per line, then one
        eligible coupon. Targets include category descendants.
      </p>
      {!show && (
        <button
          onClick={() => setShow(true)}
          className="mb-4 rounded-lg px-4 py-2 text-sm font-medium shopnest-primary"
        >
          New promotion
        </button>
      )}
      {show && (
        <form
          onSubmit={create}
          className="mb-6 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="col-span-full">
            <AdminSwitch
              label="Apply automatically without a coupon"
              checked={form.automatic}
              onChange={(automatic) => setForm({ ...form, automatic })}
            />
          </div>
          <PricingField label={form.automatic ? 'Internal promotion code' : 'Coupon code'}>
            <AdminInput
              aria-label="Promotion code"
              required
              minLength={3}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </PricingField>
          <PricingField label="Discount type">
            <AdminSelect
              id="promotion-type"
              value={form.type}
              options={[
                { value: 'PERCENT', label: 'Percentage' },
                { value: 'FIXED_AMOUNT', label: 'Fixed amount (USD)' },
              ]}
              onChange={(type) => setForm({ ...form, type })}
            />
          </PricingField>
          <PricingField label={form.type === 'PERCENT' ? 'Percentage (%)' : 'Amount (USD)'}>
            <AdminInput
              aria-label="Promotion value"
              required
              type="number"
              min={form.type === 'PERCENT' ? 1 : 0.01}
              max={form.type === 'PERCENT' ? 100 : undefined}
              step={form.type === 'PERCENT' ? 1 : 0.01}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </PricingField>
          <PricingField label="Starts">
            <DateTimePicker
              label="Promotion starts"
              value={form.startsAt}
              onChange={(startsAt) => setForm({ ...form, startsAt })}
            />
          </PricingField>
          <PricingField label="Ends">
            <DateTimePicker
              label="Promotion ends"
              defaultTime="23:59"
              value={form.endsAt}
              onChange={(endsAt) => setForm({ ...form, endsAt })}
            />
          </PricingField>
          <PricingField label="Minimum eligible purchase (USD)">
            <AdminInput
              aria-label="Minimum eligible purchase"
              type="number"
              min={0}
              step="0.01"
              value={form.min}
              onChange={(e) => setForm({ ...form, min: e.target.value })}
            />
          </PricingField>
          <PricingField label="Maximum discount (USD)">
            <AdminInput
              aria-label="Maximum discount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value })}
            />
          </PricingField>
          {!form.automatic && (
            <>
              <PricingField label="Total usage limit">
                <AdminInput
                  aria-label="Total usage limit"
                  type="number"
                  min={1}
                  value={form.total}
                  onChange={(e) => setForm({ ...form, total: e.target.value })}
                />
              </PricingField>
              <PricingField label="Per-customer usage limit">
                <AdminInput
                  aria-label="Per customer usage limit"
                  type="number"
                  min={1}
                  value={form.perUser}
                  onChange={(e) => setForm({ ...form, perUser: e.target.value })}
                />
              </PricingField>
            </>
          )}
          {scope === 'admin' && (
            <>
              <PricingField label="Eligible targets">
                <AdminSelect
                  id="promotion-target"
                  value={form.target}
                  options={['ALL', 'PRODUCTS', 'BRANDS', 'CATEGORIES', 'TYPES', 'VENDORS'].map(
                    (value) => ({
                      value,
                      label:
                        value === 'ALL'
                          ? 'All eligible products'
                          : value === 'TYPES'
                            ? 'Product types'
                            : value.charAt(0) + value.slice(1).toLowerCase(),
                    }),
                  )}
                  onChange={(target) => {
                    setForm({ ...form, target });
                    setSelected([]);
                    setSearch('');
                  }}
                />
              </PricingField>
              {form.target !== 'ALL' && (
                <div className="sm:col-span-2">
                  <PricingField
                    label={
                      form.target === 'TYPES'
                        ? 'Product types (comma separated)'
                        : `Search ${form.target.toLowerCase()}`
                    }
                  >
                    <AdminInput
                      aria-label="Search promotion targets"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </PricingField>
                  {form.target !== 'TYPES' && (
                    <div className="mt-2 max-h-40 overflow-auto rounded-md border border-gray-200 p-2">
                      {(targets[form.target] ?? [])
                        .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
                        .slice(0, 100)
                        .map((t) => (
                          <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
                            <Checkbox
                              checked={selected.includes(t.id)}
                              onChange={(e) =>
                                setSelected((v) =>
                                  e.target.checked ? [...v, t.id] : v.filter((id) => id !== t.id),
                                )
                              }
                            />
                            {t.name}
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="col-span-full flex gap-3">
            <button
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-medium shopnest-primary disabled:opacity-50"
            >
              Create promotion
            </button>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-blue-50/50 text-gray-500">
            <tr>
              {['Promotion', 'Discount', 'Validity', 'Targets', 'Status', ''].map((h) => (
                <th className="px-4 py-3 font-medium" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {promotions.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">
                  {p.code}
                  <span className="block text-xs font-normal text-gray-500">
                    {p.automatic ? 'Automatic' : 'Coupon'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.type === 'PERCENT' ? `${p.value}%` : formatPrice(p.value)}
                  {p.maxDiscountCents ? (
                    <span className="block text-xs text-gray-500">
                      Capped at {formatPrice(p.maxDiscountCents)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(p.startsAt).toLocaleDateString()} –{' '}
                  {new Date(p.endsAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {[
                    p.productIds?.length ? `${p.productIds.length} products` : '',
                    p.brandIds?.length ? `${p.brandIds.length} brands` : '',
                    p.categoryIds?.length ? `${p.categoryIds.length} categories` : '',
                    p.vendorIds?.length ? `${p.vendorIds.length} vendors` : '',
                    p.productTypes?.join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'All eligible products'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${p.isActive ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button disabled={pending} onClick={() => toggle(p)} className="text-[#0077b6]">
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!promotions.length && (
          <p className="p-8 text-center text-sm text-gray-500">No promotions yet.</p>
        )}
      </div>
      {scope === 'admin' && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold">Marketplace tax classes</h2>
          <p className="mt-1 text-xs text-gray-500">
            These store-wide rates apply to offers assigned to each class. Exempt offers remain
            untaxed. No location-specific tax service is configured.
          </p>
          <div className="my-3 flex flex-wrap gap-2">
            {taxClasses.map((c) => (
              <button
                type="button"
                key={c.id}
                aria-label={`Edit tax class ${c.name}`}
                onClick={() => {
                  setEditingTaxId(c.id);
                  setTaxName(c.name);
                  setTaxRate(String(c.rateBps / 100));
                }}
                className="rounded-full bg-gray-50 px-3 py-1 text-sm hover:bg-blue-50"
              >
                {c.name} · {c.rateBps / 100}%
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                try {
                  const body = { name: taxName, rateBps: Math.round(Number(taxRate) * 100) };
                  const taxClass = editingTaxId
                    ? await api.updateTaxClass(editingTaxId, body)
                    : await api.createTaxClass(body);
                  setTaxClasses((v) => [...v.filter((c) => c.id !== taxClass.id), taxClass]);
                  setEditingTaxId(null);
                  setTaxName('');
                  setTaxRate('');
                } catch (e) {
                  setError((e as Error).message);
                }
              });
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <PricingField label="Class name">
              <AdminInput
                aria-label="Tax class name"
                required
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
              />
            </PricingField>
            <PricingField label="Rate (%)">
              <AdminInput
                aria-label="Tax rate"
                type="number"
                required
                min={0}
                max={100}
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </PricingField>
            <button
              disabled={pending}
              className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-[#0077b6]"
            >
              {editingTaxId ? 'Save tax class' : 'Add tax class'}
            </button>
            {editingTaxId && (
              <button
                type="button"
                className="text-sm text-gray-500"
                onClick={() => {
                  setEditingTaxId(null);
                  setTaxName('');
                  setTaxRate('');
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
