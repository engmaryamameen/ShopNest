'use client';
import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { PricingSettings, PriceQuoteContext, TaxClass } from '@/lib/api-types';
import { AdminInput, AdminSelect, AdminSwitch } from '@/components/ui/admin-form';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { OfferPriceEstimate } from './offer-price-estimate';
import styles from './offer-pricing-fields.module.css';
export const DEFAULT_PRICING: PricingSettings = {
  taxable: true,
  priceIncludesTax: false,
  taxClassId: null,
  discountEnabled: false,
  discountType: 'PERCENT',
  discountValue: 0,
  discountStartsAt: null,
  discountEndsAt: null,
};
export function PricingField({ label, children }: { label: string; children: ReactNode }) {
  const first = Children.toArray(children)[0];
  const inputId = isValidElement<{ id?: string }>(first) ? first.props.id : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}

type PricingValueProps = { value: PricingSettings; onChange: (value: PricingSettings) => void };

export function OfferDiscountFields({ value, onChange }: PricingValueProps) {
  const fieldId = useId();
  const update = (fields: Partial<PricingSettings>) => onChange({ ...value, ...fields });
  const dateValue = (v?: string | null) =>
    v
      ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : '';
  return (
    <div className="space-y-3">
      <AdminSwitch
        label="Enable direct discount"
        checked={value.discountEnabled ?? false}
        onChange={(discountEnabled) => update({ discountEnabled })}
      />
      {value.discountEnabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PricingField label="Discount type">
            <AdminSelect
              id={`${fieldId}-discount-type`}
              value={value.discountType ?? 'PERCENT'}
              options={[
                { value: 'PERCENT', label: 'Percentage' },
                { value: 'FIXED_AMOUNT', label: 'Fixed amount (USD)' },
              ]}
              onChange={(type) =>
                update({ discountType: type as 'PERCENT' | 'FIXED_AMOUNT', discountValue: 0 })
              }
            />
          </PricingField>
          <PricingField
            label={value.discountType === 'FIXED_AMOUNT' ? 'Discount amount (USD)' : 'Discount (%)'}
          >
            <AdminInput
              aria-label="Discount value"
              type="number"
              min="0"
              max={value.discountType === 'PERCENT' ? 100 : undefined}
              step={value.discountType === 'PERCENT' ? 1 : 0.01}
              value={
                value.discountType === 'FIXED_AMOUNT'
                  ? (value.discountValue ?? 0) / 100
                  : (value.discountValue ?? 0)
              }
              onChange={(e) =>
                update({
                  discountValue: Math.round(
                    Number(e.target.value) * (value.discountType === 'FIXED_AMOUNT' ? 100 : 1),
                  ),
                })
              }
            />
          </PricingField>
          <PricingField label="Discount starts (optional)">
            <DateTimePicker
              label="Discount starts"
              value={dateValue(value.discountStartsAt)}
              onChange={(next) =>
                update({
                  discountStartsAt: next ? new Date(next).toISOString() : null,
                })
              }
            />
          </PricingField>
          <PricingField label="Discount ends (optional)">
            <DateTimePicker
              label="Discount ends"
              defaultTime="23:59"
              value={dateValue(value.discountEndsAt)}
              onChange={(next) =>
                update({
                  discountEndsAt: next ? new Date(next).toISOString() : null,
                })
              }
            />
          </PricingField>
        </div>
      )}
    </div>
  );
}

export function OfferTaxFields({
  value,
  onChange,
  taxClasses: supplied,
}: PricingValueProps & { taxClasses?: TaxClass[] }) {
  const fieldId = useId();
  const [fetched, setFetched] = useState<TaxClass[]>([]);
  const [error, setError] = useState('');
  const classes = supplied ?? fetched;
  useEffect(() => {
    if (supplied) return;
    let cancelled = false;
    api
      .taxClasses()
      .then((next) => {
        if (!cancelled) {
          setFetched(next);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load tax classes.');
      });
    return () => {
      cancelled = true;
    };
  }, [supplied]);
  const update = (fields: Partial<PricingSettings>) => onChange({ ...value, ...fields });
  return (
    <div>
      <div className="min-w-0 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">Tax configuration</h3>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <AdminSwitch
            label="Taxable"
            checked={value.taxable !== false}
            onChange={(taxable) => update({ taxable })}
          />
          <AdminSwitch
            label="Price includes tax"
            checked={value.priceIncludesTax ?? false}
            onChange={(priceIncludesTax) => update({ priceIncludesTax })}
          />
        </div>
        <PricingField label="Tax class">
          <AdminSelect
            id={`${fieldId}-tax-class`}
            value={value.taxClassId ?? ''}
            options={[
              { value: '', label: 'No configured tax rate (0%)' },
              ...classes
                .filter((c) => c.isActive)
                .map((c) => ({ value: c.id, label: `${c.name} (${c.rateBps / 100}%)` })),
            ]}
            onChange={(taxClassId) => update({ taxClassId: taxClassId || null })}
          />
        </PricingField>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function OfferPricingFields({
  value,
  onChange,
  priceCents,
  taxClasses,
  context,
}: PricingValueProps & {
  priceCents: number;
  taxClasses?: TaxClass[];
  context?: PriceQuoteContext;
}) {
  return (
    <div className={styles.root + ' space-y-4'}>
      <OfferDiscountFields value={value} onChange={onChange} />
      <div className={styles.summary + ' border-t border-gray-100 pt-4'}>
        <OfferTaxFields value={value} onChange={onChange} taxClasses={taxClasses} />
        <OfferPriceEstimate value={value} priceCents={priceCents} context={context} />
      </div>
    </div>
  );
}
