'use client';
import { SourceCategoryPicker } from './source-category-picker';
import styles from './catalog-import-panel.module.css';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckIcon } from '@/assets/icons';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  CatalogSource,
  CatalogImportRunResponse,
  ImportPreviewResponse,
  ImportScopeInput,
  ImportOptions,
  PricingSettings,
} from '@/lib/api-types';
import { AdminAccordion, AdminInput, AdminSelect, AdminSwitch } from '@/components/ui/admin-form';
import { AdminReveal } from '@/components/ui/admin-reveal';
import { Checkbox } from '@/components/ui/checkbox';
import { ToastMessage } from '@/components/ui/toast';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  OfferDiscountFields,
  OfferTaxFields,
  DEFAULT_PRICING,
  PricingField,
} from '@/components/shared/offer-pricing-fields';
import { formatPrice } from '@/lib/format-price';
import { OfferPriceEstimate } from '@/components/shared/offer-price-estimate';
import { categoryOptions } from '@/lib/category-tree';

const DEFAULT_IMPORT_SETTINGS = {
  minimumImages: 1,
  maximumImages: 3,
  minimumResolution: 0,
  rescan: false,
  targetCategoryId: '',
};

function ImportRunNotification({ run }: { run: CatalogImportRunResponse }) {
  const active = run.status === 'QUEUED' || run.status === 'RUNNING';
  const total = Math.max(run.scopedCount, run.processedCount);
  const remaining = Math.max(0, total - run.processedCount);
  const counts = `${run.processedCount} of ${total} processed · ${remaining} remaining`;
  return (
    <ToastMessage
      title={
        run.status === 'QUEUED'
          ? 'Import queued'
          : run.status === 'RUNNING'
            ? 'Importing products'
            : run.status === 'SUCCEEDED'
              ? 'Import complete'
              : 'Import needs attention'
      }
      message={
        active
          ? total > 0
            ? counts
            : 'Waiting for the import to start.'
          : run.status === 'SUCCEEDED'
            ? `${run.createdCount} imported · ${Math.max(0, run.processedCount - run.createdCount)} skipped`
            : `${counts}. ${run.errorMessage || 'Open import history for details.'}`
      }
      tone={active ? 'info' : run.status === 'SUCCEEDED' ? 'success' : 'error'}
      duration={active ? null : 6000}
      progress={active && total > 0 ? run.processedCount / total : undefined}
      action={{ label: 'View import history', href: '/admin/imports?tab=history' }}
    />
  );
}

export function CatalogImportPanel({
  initialOptions,
  runs,
}: {
  initialOptions?: ImportOptions;
  runs?: CatalogImportRunResponse[];
} = {}) {
  const router = useRouter();
  const [options, setOptions] = useState<ImportOptions | null>(initialOptions ?? null);
  const [source, setSource] = useState<CatalogSource>(
    initialOptions?.sources.find((item) => item.id === 'OPEN_FOOD_FACTS' && item.available)?.id ??
      initialOptions?.sources.find((item) => item.available)?.id ??
      'OPEN_FOOD_FACTS',
  );
  const [categorySearch, setCategorySearch] = useState('');
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; parents: string[] }>
  >([]);
  const [selectedCategories, setSelectedCategories] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [customizeSettings, setCustomizeSettings] = useState(false);
  const [minimumImages, setMinimumImages] = useState(1);
  const [maximumImages, setMaximumImages] = useState(3);
  const [minimumResolution, setMinimumResolution] = useState(0);
  const [rescan, setRescan] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const importSettings = customizeSettings
    ? { minimumImages, maximumImages, minimumResolution, rescan, targetCategoryId }
    : DEFAULT_IMPORT_SETTINGS;
  const [publish, setPublish] = useState(false);
  const [vendorIds, setVendorIds] = useState<string[]>(
    initialOptions?.vendors.length === 1 ? [initialOptions.vendors[0].id] : [],
  );
  const [vendorSearch, setVendorSearch] = useState('');
  const [strategy, setStrategy] = useState<'FIXED' | 'RANGE' | 'CATEGORY'>('FIXED');
  const [price, setPrice] = useState('9.99');
  const [maxPrice, setMaxPrice] = useState('29.99');
  const [categoryPrices, setCategoryPrices] = useState<
    Record<string, { min: string; max: string }>
  >({});
  const [inventory, setInventory] = useState('FIXED');
  const [stock, setStock] = useState(20);
  const [maxStock, setMaxStock] = useState(50);
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [promotion, setPromotion] = useState('NONE');
  const [promotionCode, setPromotionCode] = useState('');
  const [promotionType, setPromotionType] = useState<'PERCENT' | 'FIXED_AMOUNT'>('PERCENT');
  const [promotionValue, setPromotionValue] = useState(10);
  const [promotionTarget, setPromotionTarget] =
    useState<NonNullable<ImportScopeInput['promotionTarget']>>('IMPORT');
  const [promotionId, setPromotionId] = useState('');
  const [promotionStarts, setPromotionStarts] = useState('');
  const [promotionEnds, setPromotionEnds] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [partialSample, setPartialSample] = useState<ImportPreviewResponse['sample']>([]);
  const [approvedScope, setApprovedScope] = useState<ImportScopeInput | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<'preview' | 'import' | null>(null);
  const [progress, setProgress] = useState<{
    scanned: number;
    eligible: number;
    requested?: number;
    productName?: string;
    imagesChecked?: number;
    imageTotal?: number;
  } | null>(null);
  const [error, setErrorMessage] = useState('');
  const [errorVersion, setErrorVersion] = useState(0);
  const setError = useCallback((message: string) => {
    setErrorMessage(message);
    if (message) setErrorVersion((version) => version + 1);
  }, []);
  const [notice, setNotice] = useState('');
  const [importRun, setImportRun] = useState<CatalogImportRunResponse | null>(
    () => runs?.find((run) => run.status === 'QUEUED' || run.status === 'RUNNING') ?? null,
  );
  useEffect(() => {
    if (!runs) return;
    setImportRun((current) => {
      const updated = runs.find((run) => run.id === current?.id);
      if (updated && (current?.status === 'QUEUED' || current?.status === 'RUNNING'))
        return updated;
      return (
        runs.find((run) => run.status === 'QUEUED' || run.status === 'RUNNING') ??
        updated ??
        current
      );
    });
  }, [runs]);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const progressId = useId();
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const previewAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (initialOptions && optionsAttempt === 0) return;
    api
      .adminImportOptions()
      .then((data) => {
        setOptions(data);
        setSource((current) =>
          data.sources.some((item) => item.id === current && item.available)
            ? current
            : (data.sources.find((item) => item.available)?.id ?? current),
        );
        if (data.vendors.length === 1) setVendorIds([data.vendors[0].id]);
      })
      .catch((e) => setError(e.message));
  }, [optionsAttempt, initialOptions]);
  useEffect(() => {
    let cancelled = false;
    setCategoryLoading(true);
    const timer = setTimeout(
      () =>
        api
          .adminImportCategories(source, categorySearch)
          .then((data) => {
            if (!cancelled) {
              setCategories(data);
              setCategoryError('');
            }
          })
          .catch((e) => {
            if (!cancelled) setCategoryError(e.message);
          })
          .finally(() => {
            if (!cancelled) setCategoryLoading(false);
          }),
      300,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, categorySearch]);
  // A changed form always requires a fresh review. Selection alone keeps the snapshot.
  const configKey = JSON.stringify({
    source,
    selectedCategories,
    quantity,
    importSettings,
    publish,
    vendorIds,
    strategy,
    price,
    maxPrice,
    categoryPrices,
    inventory,
    stock,
    maxStock,
    pricing,
    promotion,
    promotionCode,
    promotionType,
    promotionValue,
    promotionTarget,
    promotionId,
    promotionStarts,
    promotionEnds,
  });
  useEffect(() => {
    setPreview(null);
    setSelected([]);
    setApprovedScope(null);
  }, [configKey]);
  function buildScope(): ImportScopeInput {
    return {
      source,
      categoryScope: selectedCategories.map((c) => c.id),
      maxRecords: quantity,
      minImageCount: importSettings.minimumImages,
      maxImageCount: Math.max(importSettings.maximumImages, importSettings.minimumImages),
      minImageDimension: importSettings.minimumResolution,
      rescan: importSettings.rescan,
      targetCategoryId: importSettings.targetCategoryId || undefined,
      ...(publish
        ? {
            ...pricing,
            pricingStrategy: strategy,
            vendorIds,
            demoPriceCents: Math.round(Number(price) * 100),
            demoStockQuantity: stock,
            ...(strategy !== 'FIXED'
              ? {
                  minPriceCents: Math.round(Number(price) * 100),
                  maxPriceCents: Math.round(Number(maxPrice) * 100),
                }
              : {}),
            categoryPrices:
              strategy === 'CATEGORY'
                ? selectedCategories.map((c) => ({
                    category: c.id,
                    minCents: Math.round(Number(categoryPrices[c.id]?.min ?? price) * 100),
                    maxCents: Math.round(Number(categoryPrices[c.id]?.max ?? maxPrice) * 100),
                  }))
                : undefined,
            ...(inventory === 'RANGE' ? { minStock: stock, maxStock } : {}),
            ...(promotion === 'EXISTING'
              ? { promotionId }
              : promotion !== 'NONE'
                ? {
                    promotionTarget,
                    promotion: {
                      code: promotionCode.trim().toUpperCase(),
                      automatic: promotion === 'AUTOMATIC',
                      type: promotionType,
                      value:
                        promotionType === 'PERCENT'
                          ? promotionValue
                          : Math.round(promotionValue * 100),
                      startsAt: promotionStarts
                        ? new Date(promotionStarts).toISOString()
                        : new Date().toISOString(),
                      endsAt: promotionEnds
                        ? new Date(promotionEnds).toISOString()
                        : new Date(Date.now() + 30 * 86400000).toISOString(),
                    },
                  }
                : {}),
          }
        : {}),
    };
  }
  function validateSelection() {
    const { minimumImages, maximumImages, minimumResolution } = importSettings;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500)
      return 'Choose between 1 and 500 new products.';
    if (
      !Number.isInteger(minimumImages) ||
      minimumImages < 1 ||
      minimumImages > 10 ||
      !Number.isInteger(maximumImages) ||
      maximumImages < minimumImages ||
      maximumImages > 10
    )
      return 'Choose between 1 and 10 photos. The maximum must cover the minimum.';
    if (!Number.isInteger(minimumResolution) || minimumResolution < 0 || minimumResolution > 2000)
      return 'Minimum image size must be between 0 and 2,000 pixels.';
    return '';
  }
  function goToPublishing() {
    const problem = validateSelection();
    setError(problem);
    if (!problem) {
      setStep(1);
    }
  }
  useEffect(() => {
    if (step !== 2 && previousStep.current !== step) {
      stepHeading.current?.focus({ preventScroll: true });
      stepHeading.current?.scrollIntoView({ block: 'nearest' });
    }
    previousStep.current = step;
  }, [step]);
  async function prepare() {
    const selectionProblem = validateSelection();
    const validAmount = (value: string) =>
      value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
    let problem = selectionProblem;
    if (!problem && publish) {
      if (
        !validAmount(price) ||
        (strategy !== 'FIXED' && (!validAmount(maxPrice) || Number(maxPrice) < Number(price)))
      )
        problem = 'Enter a valid price. A price range must end at or above its minimum.';
      else if (strategy === 'CATEGORY' && !selectedCategories.length)
        problem = 'Select source categories before setting category price ranges.';
      else if (
        strategy === 'CATEGORY' &&
        selectedCategories.some((category) => {
          const range = categoryPrices[category.id];
          return (
            !validAmount(range?.min ?? price) ||
            !validAmount(range?.max ?? maxPrice) ||
            Number(range?.max ?? maxPrice) < Number(range?.min ?? price)
          );
        })
      )
        problem = 'Check each category price range. Every maximum must cover its minimum.';
      else if (
        !Number.isInteger(stock) ||
        stock < 0 ||
        stock > 10000 ||
        (inventory === 'RANGE' &&
          (!Number.isInteger(maxStock) || maxStock < stock || maxStock > 10000))
      )
        problem = 'Stock must be a whole number from 0 to 10,000. Check the range maximum.';
      else if (promotion === 'EXISTING' && !promotionId)
        problem = 'Choose an existing coupon or remove the additional promotion.';
      else if (
        promotion !== 'NONE' &&
        promotion !== 'EXISTING' &&
        (!promotionCode.trim() ||
          !Number.isFinite(promotionValue) ||
          promotionValue <= 0 ||
          (promotionType === 'PERCENT' && promotionValue > 100))
      )
        problem = 'Enter a promotion code and a valid discount. Percentages cannot exceed 100%.';
      else if (
        promotionStarts &&
        promotionEnds &&
        new Date(promotionEnds) <= new Date(promotionStarts)
      )
        problem = 'The promotion must end after its start date.';
    }
    if (problem) {
      setError(problem);
      if (selectionProblem) setStep(0);
      return;
    }
    setError('');
    setNotice('');
    setProgress(null);
    setPartialSample([]);
    setPreview(null);
    setSelected([]);
    setApprovedScope(null);
    setPending('preview');
    try {
      const scope = buildScope();
      const queued = await api.adminPreviewImport(scope);
      let result = await api.adminImportPreviewStatus(queued.previewId);
      while (result.status === 'PREPARING') {
        if (!mounted.current) return;
        if (result.progress) setProgress(result.progress);
        if (result.partialSample) setPartialSample(result.partialSample);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (!mounted.current) return;
        result = await api.adminImportPreviewStatus(queued.previewId);
      }
      if (result.status !== 'READY')
        throw new Error(result.errorMessage || 'Preview could not be prepared. Try again.');
      setPreview(result);
      setStep(2);
      setApprovedScope(scope);
      setSelected(result.sample.filter((p) => p.action === 'create').map((p) => p.externalId));
      setNotice(
        result.wouldCreateCount
          ? `Your preview is ready. Review ${result.wouldCreateCount} new ${result.wouldCreateCount === 1 ? 'product' : 'products'} below.`
          : 'No new products matched these filters. Try another category or adjust the photo requirements.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare preview.');
      setStep(1);
    } finally {
      setPending(null);
    }
  }
  async function confirm() {
    if (!preview || !approvedScope || pending || !selected.length) return;
    setPending('import');
    setError('');
    setNotice('');
    try {
      const run = await api.adminTriggerImport({
        ...approvedScope,
        previewId: preview.previewId,
        selectedProductIds: selected,
      });
      setPreview(null);
      setSelected([]);
      setStep(0);
      setImportRun(run);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setPending(null);
    }
  }

  const previewRows = preview?.sample ?? partialSample;
  const eligibleRows = preview?.sample.filter((product) => product.action === 'create') ?? [];
  const sourceName = options?.sources.find((item) => item.id === source)?.name ?? 'Open Food Facts';
  const chosenVendors = options?.vendors.filter((vendor) => vendorIds.includes(vendor.id)) ?? [];
  const visibleVendors =
    options?.vendors.filter((vendor) =>
      vendor.name.toLowerCase().includes(vendorSearch.toLowerCase()),
    ) ?? [];
  const examplePrice =
    strategy === 'CATEGORY' && selectedCategories.length
      ? (categoryPrices[selectedCategories[0].id]?.min ?? price)
      : price;
  const validPrice =
    !!examplePrice && Number.isFinite(Number(examplePrice)) && Number(examplePrice) > 0;
  const previewId = preview?.previewId;
  useEffect(() => {
    if (!previewId) return;
    previewHeading.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    previewHeading.current?.focus({ preventScroll: true });
  }, [previewId]);
  useEffect(() => {
    if ((notice || importRun) && !preview && !pending)
      previewAction.current?.focus({ preventScroll: true });
  }, [notice, preview, pending, importRun?.id]);
  const requestedPreviewCount = progress?.requested ?? quantity;
  const readyCount = Math.min(progress?.eligible ?? 0, requestedPreviewCount);
  return (
    <section aria-label="Catalog import configuration" className={styles.panel}>
      {importRun && <ImportRunNotification key={importRun.id} run={importRun} />}
      {error && <ToastMessage key={errorVersion} title="Import needs attention" message={error} />}
      {notice && <ToastMessage title="Catalog import" message={notice} tone="success" />}
      {pending === 'preview' && (
        <ToastMessage
          title="Preparing your preview"
          message={`${readyCount} of ${requestedPreviewCount} ready · ${Math.max(0, requestedPreviewCount - readyCount)} remaining`}
          tone="info"
          duration={null}
          progress={requestedPreviewCount > 0 ? readyCount / requestedPreviewCount : 0}
        />
      )}

      <ol className={styles.steps} aria-label="Import progress">
        {['Select products', 'Publishing', 'Review & import'].map((label, index) => {
          const state = index < step ? 'completed' : index === step ? 'current' : 'upcoming';
          const status =
            state === 'completed'
              ? 'Completed'
              : state === 'current'
                ? 'In progress'
                : index === step + 1
                  ? 'Next'
                  : 'Upcoming';
          return (
            <li key={label} data-state={state}>
              <button
                type="button"
                aria-label={label}
                aria-describedby={`${progressId}-${index}`}
                aria-current={step === index ? 'step' : undefined}
                disabled={
                  pending !== null || (index === 2 && !preview) || (index === 1 && step === 0)
                }
                onClick={() => {
                  setError('');
                  setStep(index);
                }}
              >
                <span className={styles.stepNumber} aria-hidden="true">
                  {state === 'completed' ? <CheckIcon width={15} height={15} /> : index + 1}
                </span>
                <span className={styles.stepLabel}>{label}</span>
                <span id={`${progressId}-${index}`} className="sr-only">
                  {status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.workspace} hidden={step === 2}>
        <fieldset disabled={pending !== null} className={styles.configuration}>
          <div hidden={step !== 0}>
            <section aria-labelledby="import-configuration-heading" className={styles.section}>
              <h2
                id="import-configuration-heading"
                ref={step === 0 ? stepHeading : undefined}
                tabIndex={-1}
                className="mb-4 text-base font-semibold text-gray-900 focus:outline-none"
              >
                Choose products to import
              </h2>
              <div className={styles.sourceFields}>
                <PricingField label="Source">
                  <AdminSelect
                    id="import-source"
                    value={source}
                    options={(
                      options?.sources ?? [
                        { id: 'OPEN_FOOD_FACTS', name: 'Open Food Facts', available: true },
                      ]
                    )
                      .filter((s) => s.available)
                      .map((s) => ({ value: s.id, label: s.name }))}
                    onChange={(v) => {
                      setSource(v as CatalogSource);
                      setSelectedCategories([]);
                      setCategorySearch('');
                    }}
                  />
                </PricingField>
                <SourceCategoryPicker
                  categories={categories}
                  selected={selectedCategories}
                  query={categorySearch}
                  onQueryChange={setCategorySearch}
                  onChange={setSelectedCategories}
                  loading={categoryLoading}
                  error={categoryError}
                />
                <div className={styles.quantity}>
                  <PricingField label="Product limit">
                    <AdminInput
                      aria-label="Product quantity"
                      type="number"
                      min={1}
                      max={500}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                  </PricingField>
                </div>
              </div>
            </section>
            {options && !options.sources.some((item) => item.available) && (
              <p role="status" className="mt-3 text-sm text-amber-800">
                No catalog sources are currently available.
              </p>
            )}
            <p className={styles.fieldHint}>
              Import up to {quantity || 0} new products. Existing products are skipped.
            </p>
            <section className={styles.settingsBlock} aria-label="Import settings">
              <AdminSwitch
                label="Customize import settings"
                variant="setting"
                controls="import-custom-settings"
                description={
                  customizeSettings
                    ? 'Set category mapping, photo checks and rescanning.'
                    : 'Defaults: automatic category mapping, 1–3 photos, any resolution.'
                }
                checked={customizeSettings}
                onChange={(checked) => {
                  setCustomizeSettings(checked);
                  setError('');
                }}
              />
              <AdminReveal id="import-custom-settings" open={customizeSettings}>
                <div className={styles.settingsContent}>
                  <div className={styles.advancedColumns}>
                    <section aria-labelledby="import-mapping-heading">
                      <h3
                        id="import-mapping-heading"
                        className="mb-3 text-sm font-semibold text-gray-900"
                      >
                        Category mapping
                      </h3>
                      <PricingField label="ShopNest category">
                        <AdminSelect
                          id="import-map-category"
                          value={targetCategoryId}
                          options={[
                            { value: '', label: 'Automatic ShopNest category mapping' },
                            ...categoryOptions(options?.categories ?? []).map((category) => ({
                              value: category.id,
                              label: category.path,
                            })),
                          ]}
                          onChange={setTargetCategoryId}
                        />
                      </PricingField>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        Automatic rules map supplier categories to ShopNest. A manual selection
                        overrides this import only.
                      </p>
                    </section>
                    <section aria-labelledby="import-quality-heading">
                      <h3
                        id="import-quality-heading"
                        className="mb-3 text-sm font-semibold text-gray-900"
                      >
                        Image quality
                      </h3>
                      <div className={styles.qualityFields}>
                        <PricingField label="Min. photos">
                          <AdminInput
                            aria-label="Minimum unique images"
                            type="number"
                            min={1}
                            max={10}
                            value={minimumImages}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setMinimumImages(value);
                              setMaximumImages((current) => Math.max(current, value));
                            }}
                          />
                        </PricingField>
                        <PricingField label="Keep up to">
                          <AdminInput
                            aria-label="Photos per product"
                            type="number"
                            min={minimumImages}
                            max={10}
                            value={maximumImages}
                            onChange={(event) => setMaximumImages(Number(event.target.value))}
                          />
                        </PricingField>
                        <PricingField label="Min. edge (px)">
                          <AdminInput
                            aria-label="Minimum image resolution"
                            type="number"
                            min={0}
                            max={2000}
                            step={100}
                            value={minimumResolution}
                            onChange={(event) => setMinimumResolution(Number(event.target.value))}
                          />
                        </PricingField>
                      </div>
                    </section>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    Only unique photos count. Resolution is the minimum longest edge in pixels (0 =
                    any size).
                  </p>
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <AdminSwitch
                      label="Rescan selected categories"
                      description="Start from the beginning with these quality filters."
                      checked={rescan}
                      onChange={setRescan}
                    />
                  </div>
                </div>
              </AdminReveal>
            </section>
          </div>
          <div hidden={step !== 1}>
            <section aria-labelledby="import-publishing-heading" className={styles.section}>
              <h2
                id="import-publishing-heading"
                ref={step === 1 ? stepHeading : undefined}
                tabIndex={-1}
                className="mb-3 text-base font-semibold text-gray-900 focus:outline-none"
              >
                Decide how products go live
              </h2>
              <fieldset
                className={styles.publishChoices}
                aria-labelledby="import-publishing-heading"
              >
                <label className={styles.publishChoice}>
                  <input
                    type="radio"
                    name="import-publishing"
                    value="draft"
                    checked={!publish}
                    onChange={() => setPublish(false)}
                  />
                  <span>
                    <strong>Save as drafts</strong>
                    <small>Review and edit first. Hidden from customers.</small>
                  </span>
                </label>
                <label className={styles.publishChoice}>
                  <input
                    type="radio"
                    name="import-publishing"
                    value="publish"
                    checked={publish}
                    onChange={() => setPublish(true)}
                  />
                  <span>
                    <strong>Create offers & publish</strong>
                    <small>Set vendors, prices and stock before importing.</small>
                  </span>
                </label>
              </fieldset>
              {publish && (
                <div className="mt-5 space-y-4">
                  <p className={styles.commerceNote}>
                    Prices and stock are assigned by these rules, not supplied by the source. Verify
                    them before publishing.
                  </p>
                  <div className={styles.offerSetup}>
                    <section aria-labelledby="import-vendors-heading" className="min-w-0">
                      <h3
                        id="import-vendors-heading"
                        className="mb-3 text-sm font-semibold text-gray-900"
                      >
                        Vendor assignment
                      </h3>
                      {(options?.vendors.length ?? 0) > 1 && (
                        <AdminInput
                          aria-label="Search vendors"
                          placeholder="Search approved vendors"
                          value={vendorSearch}
                          onChange={(event) => setVendorSearch(event.target.value)}
                        />
                      )}
                      <div className={styles.vendorList}>
                        {visibleVendors.map((vendor) => (
                          <label key={vendor.id} className="flex items-center gap-2 py-1.5 text-sm">
                            <Checkbox
                              checked={vendorIds.includes(vendor.id)}
                              onChange={(event) =>
                                setVendorIds((ids) =>
                                  event.target.checked
                                    ? [...ids, vendor.id]
                                    : ids.filter((id) => id !== vendor.id),
                                )
                              }
                            />
                            {vendor.name}
                          </label>
                        ))}
                        {!options && (
                          <p role="status" className="text-sm text-gray-500">
                            Loading vendors…
                          </p>
                        )}
                        {options && !visibleVendors.length && (
                          <p className="text-sm text-gray-500">
                            {options.vendors.length
                              ? 'No vendors match your search.'
                              : 'The platform vendor will be used.'}
                          </p>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {vendorIds.length > 1
                          ? 'Products are distributed evenly between selected vendors.'
                          : vendorIds.length
                            ? 'Products will be assigned to the selected vendor.'
                            : 'Products will be assigned to the platform vendor.'}
                      </p>
                    </section>
                    <section
                      aria-labelledby="import-pricing-heading"
                      className={styles.pricingSetup}
                    >
                      <h3
                        id="import-pricing-heading"
                        className="mb-3 text-sm font-semibold text-gray-900"
                      >
                        Pricing & inventory
                      </h3>
                      <div
                        className={`${styles.commercialRow} ${strategy !== 'FIXED' ? styles.rangeRow : ''}`}
                      >
                        <div className={styles.strategy}>
                          <PricingField label="Pricing strategy">
                            <AdminSelect
                              id="import-pricing-strategy"
                              value={strategy}
                              options={[
                                { value: 'FIXED', label: 'Fixed regular price' },
                                { value: 'RANGE', label: 'Automatic price range' },
                                { value: 'CATEGORY', label: 'Category price ranges' },
                              ]}
                              onChange={(next) => setStrategy(next as typeof strategy)}
                            />
                          </PricingField>
                        </div>
                        <div className={styles.number}>
                          <PricingField
                            label={
                              strategy === 'FIXED' ? 'Regular price (USD)' : 'Min. price (USD)'
                            }
                          >
                            <AdminInput
                              aria-label="Regular or minimum price"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={price}
                              onChange={(event) => setPrice(event.target.value)}
                            />
                          </PricingField>
                        </div>
                        {strategy !== 'FIXED' && (
                          <div className={styles.number}>
                            <PricingField label="Max. price (USD)">
                              <AdminInput
                                aria-label="Maximum price"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={maxPrice}
                                onChange={(event) => setMaxPrice(event.target.value)}
                              />
                            </PricingField>
                          </div>
                        )}
                      </div>
                      {strategy === 'CATEGORY' && (
                        <div className="space-y-2">
                          {selectedCategories.length ? (
                            selectedCategories.map((c) => (
                              <div key={c.id} className={styles.categoryPriceRow}>
                                <span>{c.name}</span>
                                <AdminInput
                                  aria-label={`${c.name} minimum price`}
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={categoryPrices[c.id]?.min ?? price}
                                  onChange={(e) =>
                                    setCategoryPrices((v) => ({
                                      ...v,
                                      [c.id]: {
                                        min: e.target.value,
                                        max: v[c.id]?.max ?? maxPrice,
                                      },
                                    }))
                                  }
                                />
                                <AdminInput
                                  aria-label={`${c.name} maximum price`}
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={categoryPrices[c.id]?.max ?? maxPrice}
                                  onChange={(e) =>
                                    setCategoryPrices((v) => ({
                                      ...v,
                                      [c.id]: { min: v[c.id]?.min ?? price, max: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-amber-700">
                              Select specific source categories to set their price ranges.
                            </p>
                          )}
                        </div>
                      )}

                      <div
                        className={`${styles.commercialRow} ${inventory === 'RANGE' ? styles.rangeRow : ''}`}
                      >
                        <div className={styles.strategy}>
                          <PricingField label="Inventory strategy">
                            <AdminSelect
                              id="import-inventory-strategy"
                              value={inventory}
                              options={[
                                { value: 'FIXED', label: 'Fixed stock' },
                                { value: 'RANGE', label: 'Automatic stock range' },
                              ]}
                              onChange={setInventory}
                            />
                          </PricingField>
                        </div>
                        <div className={styles.number}>
                          <PricingField
                            label={inventory === 'FIXED' ? 'Stock quantity' : 'Minimum stock'}
                          >
                            <AdminInput
                              aria-label="Stock quantity"
                              type="number"
                              min={0}
                              max={10000}
                              value={stock}
                              onChange={(event) => setStock(Number(event.target.value))}
                            />
                          </PricingField>
                        </div>
                        {inventory === 'RANGE' && (
                          <div className={styles.number}>
                            <PricingField label="Maximum stock">
                              <AdminInput
                                aria-label="Maximum stock"
                                type="number"
                                min={0}
                                max={10000}
                                value={maxStock}
                                onChange={(event) => setMaxStock(Number(event.target.value))}
                              />
                            </PricingField>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>{' '}
                  <AdminAccordion title="Discounts & promotions">
                    <OfferDiscountFields value={pricing} onChange={setPricing} />
                    <div className="mt-4">
                      <PricingField label="Additional promotion">
                        <AdminSelect
                          id="import-promotion-method"
                          value={promotion}
                          options={[
                            { value: 'NONE', label: 'No additional promotion' },
                            { value: 'AUTOMATIC', label: 'Create automatic promotion' },
                            { value: 'COUPON', label: 'Create coupon code' },
                            { value: 'EXISTING', label: 'Assign an existing coupon' },
                          ]}
                          onChange={setPromotion}
                        />
                      </PricingField>
                      {promotion !== 'NONE' && promotion !== 'EXISTING' && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <PricingField label="Promotion name / code">
                            <AdminInput
                              aria-label="Promotion code"
                              value={promotionCode}
                              onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
                            />
                          </PricingField>
                          <PricingField label="Type">
                            <AdminSelect
                              id="import-promotion-type"
                              value={promotionType}
                              options={[
                                { value: 'PERCENT', label: 'Percentage' },
                                { value: 'FIXED_AMOUNT', label: 'Fixed amount (USD)' },
                              ]}
                              onChange={(v) => setPromotionType(v as typeof promotionType)}
                            />
                          </PricingField>
                          <PricingField label="Value">
                            <AdminInput
                              aria-label="Promotion value"
                              type="number"
                              min={0.01}
                              step={promotionType === 'PERCENT' ? 1 : 0.01}
                              value={promotionValue}
                              onChange={(e) => setPromotionValue(Number(e.target.value))}
                            />
                          </PricingField>
                          <p className="col-span-full text-xs text-gray-500">
                            The default window starts now and lasts 30 days. You can set dates
                            below.
                          </p>
                        </div>
                      )}
                      {promotion !== 'NONE' && promotion !== 'EXISTING' && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <PricingField label="Promotion applies to">
                            <AdminSelect
                              id="import-promotion-target"
                              value={promotionTarget}
                              options={[
                                { value: 'IMPORT', label: 'Only products in this import' },
                                { value: 'ALL', label: 'All marketplace products' },
                                { value: 'BRANDS', label: 'These brands across the marketplace' },
                                {
                                  value: 'CATEGORIES',
                                  label: 'These categories across the marketplace',
                                },
                                {
                                  value: 'PRODUCT_TYPES',
                                  label: 'These product types across the marketplace',
                                },
                                {
                                  value: 'VENDORS',
                                  label: 'Assigned vendors across the marketplace',
                                },
                              ]}
                              onChange={(value) =>
                                setPromotionTarget(value as typeof promotionTarget)
                              }
                            />
                          </PricingField>
                          <PricingField label="Starts (optional)">
                            <DateTimePicker
                              label="Import promotion starts"
                              value={promotionStarts}
                              onChange={setPromotionStarts}
                            />
                          </PricingField>
                          <PricingField label="Ends (optional)">
                            <DateTimePicker
                              label="Import promotion ends"
                              defaultTime="23:59"
                              value={promotionEnds}
                              onChange={setPromotionEnds}
                            />
                          </PricingField>
                        </div>
                      )}
                      {promotion === 'EXISTING' && (
                        <div className="mt-3">
                          <PricingField label="Existing coupon">
                            <AdminSelect
                              id="import-existing-coupon"
                              value={promotionId}
                              options={[
                                { value: '', label: 'Choose an active coupon' },
                                ...(options?.promotions ?? [])
                                  .filter((p) => !p.automatic)
                                  .map((p) => ({ value: p.id, label: p.code })),
                              ]}
                              onChange={setPromotionId}
                            />
                          </PricingField>
                          <p className="mt-2 text-xs text-gray-500">
                            Product-targeted coupons gain these imported products. Marketplace-wide
                            coupons already cover them; dates and usage limits stay unchanged.
                          </p>
                        </div>
                      )}
                    </div>
                  </AdminAccordion>
                  <AdminAccordion title="Tax settings">
                    <OfferTaxFields
                      value={pricing}
                      onChange={setPricing}
                      taxClasses={options?.taxClasses}
                    />
                  </AdminAccordion>
                </div>
              )}
            </section>
          </div>
        </fieldset>
        <aside aria-labelledby="import-summary-heading" className={styles.summary}>
          <div>
            <h2 id="import-summary-heading" className="mb-4 text-base font-semibold text-gray-900">
              Import summary
            </h2>
            <dl className={styles.summaryRows}>
              <div>
                <dt>Source</dt>
                <dd>{sourceName}</dd>
              </div>
              <div>
                <dt>Categories</dt>
                <dd>
                  {selectedCategories.length > 2 ? (
                    <details>
                      <summary>{selectedCategories.length} selected categories</summary>
                      <ul className="mt-2 space-y-1">
                        {selectedCategories.map((category) => (
                          <li key={category.id}>{category.name}</li>
                        ))}
                      </ul>
                    </details>
                  ) : selectedCategories.length ? (
                    selectedCategories.map((category) => category.name).join(', ')
                  ) : (
                    'All source categories'
                  )}
                </dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>
                  {quantity} new {quantity === 1 ? 'product' : 'products'}
                </dd>
              </div>
              <div>
                <dt>Publishing</dt>
                <dd>{publish ? 'Create offers & publish' : 'Save as drafts'}</dd>
              </div>
              {publish && step === 1 && (
                <>
                  <div>
                    <dt>Vendors</dt>
                    <dd>
                      {chosenVendors.length
                        ? chosenVendors.map((vendor) => vendor.name).join(', ')
                        : 'Platform vendor'}
                    </dd>
                  </div>
                  <div>
                    <dt>Pricing</dt>
                    <dd>
                      {strategy === 'FIXED' ? (
                        formatPrice(Math.round(Number(price) * 100))
                      ) : strategy === 'CATEGORY' ? (
                        <details>
                          <summary>
                            {selectedCategories.length
                              ? selectedCategories.length + ' category ranges'
                              : 'Select categories'}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {selectedCategories.map((category) => (
                              <li key={category.id}>
                                {category.name}:{' '}
                                {formatPrice(
                                  Math.round(
                                    Number(categoryPrices[category.id]?.min ?? price) * 100,
                                  ),
                                )}{' '}
                                –{' '}
                                {formatPrice(
                                  Math.round(
                                    Number(categoryPrices[category.id]?.max ?? maxPrice) * 100,
                                  ),
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        formatPrice(Math.round(Number(price) * 100)) +
                        ' – ' +
                        formatPrice(Math.round(Number(maxPrice) * 100))
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Inventory</dt>
                    <dd>{inventory === 'FIXED' ? stock : stock + '–' + maxStock} per product</dd>
                  </div>
                  {pricing.discountEnabled && (
                    <div>
                      <dt>Direct discount</dt>
                      <dd>
                        {pricing.discountType === 'PERCENT'
                          ? pricing.discountValue + '%'
                          : formatPrice(pricing.discountValue ?? 0)}
                      </dd>
                    </div>
                  )}
                  {promotion !== 'NONE' && (
                    <div>
                      <dt>Promotion</dt>
                      <dd>
                        {promotion === 'EXISTING'
                          ? (options?.promotions.find((item) => item.id === promotionId)?.code ??
                            'Choose a coupon')
                          : promotionCode || 'Enter a name / code'}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            {publish && step === 1 && (
              <AdminAccordion className={styles.estimate} title="Customer price breakdown">
                <section aria-label="Estimated customer price" className="mt-3">
                  <p className="mb-2 text-xs leading-5 text-gray-500">
                    Example
                    {validPrice ? ' at ' + formatPrice(Math.round(Number(examplePrice) * 100)) : ''}
                    , before coupons. Final prices are shown in the preview.
                  </p>
                  {validPrice ? (
                    <OfferPriceEstimate
                      value={pricing}
                      priceCents={Math.round(Number(examplePrice) * 100)}
                      context={{
                        categoryId: importSettings.targetCategoryId || undefined,
                        vendorId: vendorIds.length === 1 ? vendorIds[0] : undefined,
                      }}
                      plain
                    />
                  ) : (
                    <p className="text-xs text-gray-500">Enter a price to see the estimate.</p>
                  )}
                </section>
              </AdminAccordion>
            )}
          </div>
          <div className={styles.summaryActions}>
            {!options && (
              <p role={error ? 'alert' : 'status'} className="mb-3 text-xs text-gray-500">
                {error ? 'Import options could not be loaded.' : 'Loading import options…'}
                {error && (
                  <button
                    type="button"
                    className="ml-2 text-[#0077b6] underline"
                    onClick={() => {
                      setError('');
                      setOptionsAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Try again
                  </button>
                )}
              </p>
            )}
            {step === 0 ? (
              <button
                ref={previewAction}
                type="button"
                onClick={goToPublishing}
                disabled={
                  pending !== null || !options || !options.sources.some((item) => item.available)
                }
                className="w-full rounded-lg px-5 py-2.5 text-sm font-medium shopnest-primary disabled:opacity-50"
              >
                Continue to publishing
              </button>
            ) : preview ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="block py-2 text-sm font-medium text-[#0077b6] underline underline-offset-4"
              >
                Review {preview.wouldCreateCount} eligible products
              </button>
            ) : (
              <button
                ref={previewAction}
                type="button"
                disabled={
                  pending !== null || !options || !options.sources.some((item) => item.available)
                }
                onClick={prepare}
                className="w-full rounded-lg px-5 py-2.5 text-sm font-medium shopnest-primary disabled:opacity-50"
              >
                {pending === 'preview' ? 'Preparing preview…' : 'Preview products'}
              </button>
            )}
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {step === 0
                ? 'Nothing is added until you review and confirm.'
                : preview
                  ? 'Only selected products will be imported.'
                  : publish
                    ? 'Review products, prices and inventory before importing.'
                    : 'Draft products have no offers and stay hidden from customers.'}
            </p>
            {step === 1 && (
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => setStep(0)}
                className={styles.backButton}
              >
                Back to product selection
              </button>
            )}
          </div>
        </aside>
      </div>
      {((step === 2 && preview) || pending === 'preview') && (
        <section
          id="catalog-product-preview"
          aria-labelledby="import-preview-heading"
          className={styles.preview}
        >
          <div className={styles.previewToolbar}>
            <div>
              <h2
                ref={previewHeading}
                id="import-preview-heading"
                tabIndex={-1}
                className="text-base font-semibold focus:outline-none"
              >
                Review products
              </h2>
              {preview && (
                <p className="mt-1 text-xs text-gray-500">
                  {selected.length} of {eligibleRows.length} eligible products selected
                </p>
              )}
            </div>
            {preview && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={prepare}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
                >
                  Refresh preview
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending !== null || !selected.length}
                  className="rounded-lg px-5 py-2 text-sm font-medium shopnest-primary disabled:opacity-50"
                >
                  {pending === 'import'
                    ? 'Starting import…'
                    : publish
                      ? `Import & publish ${selected.length} product${selected.length === 1 ? '' : 's'}`
                      : `Import ${selected.length} draft${selected.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </div>
          {preview ? (
            <div className={styles.reviewSummary}>
              <div>
                <strong>{sourceName}</strong>
                <span>
                  {selectedCategories.length
                    ? selectedCategories.map((c) => c.name).join(', ')
                    : 'All source categories'}
                </span>
              </div>
              <div>
                <strong>{publish ? 'Publish with offers' : 'Save as drafts'}</strong>
                <span>
                  {publish ? 'Visible to customers after import' : 'Hidden from customers'}
                </span>
              </div>
              <div>
                <strong>
                  {preview.wouldCreateCount} eligible product
                  {preview.wouldCreateCount === 1 ? '' : 's'}
                </strong>
                <span>
                  {preview.wouldBeUnchangedCount} duplicates · {preview.skippedCount} skipped ·{' '}
                  {preview.discoveredCount} scanned
                </span>
              </div>
            </div>
          ) : (
            <p className="my-3 text-sm text-gray-500">
              Products appear here as their photos are checked. You can select them when the preview
              is complete.
            </p>
          )}
          {(preview?.exhausted || preview?.scanLimitReached) && (
            <p role="status" className="mb-3 text-xs text-amber-700">
              {preview?.exhausted
                ? 'The selected source categories are exhausted. Use deliberate rescan after changing filters.'
                : 'Scan budget reached. Fewer eligible products may be available.'}
            </p>
          )}
          {!!preview?.unmappedCount && (
            <div role="status" className="mb-3 text-sm text-amber-800">
              <p>
                {preview.unmappedCount} products need a ShopNest category mapping and were not added
                to this preview.
              </p>
              <p className="mt-1 text-xs">
                {preview.unmappedCategories?.map((category) => category.name).join(', ')}. Select
                the source categories, choose a ShopNest category in advanced settings, and save
                their mapping.
              </p>
            </div>
          )}
          <div
            tabIndex={0}
            role="region"
            aria-label="Product preview table"
            className="overflow-x-auto rounded-lg border border-gray-200 focus-visible:outline-2 focus-visible:outline-[#0077b6]"
          >
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-white text-xs text-gray-500">
                <tr>
                  <th className="p-3">
                    <Checkbox
                      aria-label="Select all eligible products"
                      disabled={!preview || pending !== null}
                      checked={!!selected.length && selected.length === eligibleRows.length}
                      indeterminate={selected.length > 0 && selected.length < eligibleRows.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? eligibleRows.map((p) => p.externalId) : [])
                      }
                    />
                  </th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Category / metadata</th>
                  <th className="p-3">Vendor / stock</th>
                  <th className="p-3">Price / tax</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.map((p) => (
                  <tr key={p.externalId}>
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Select ${p.name}`}
                        disabled={!preview || pending !== null || p.action !== 'create'}
                        checked={selected.includes(p.externalId)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, p.externalId]
                              : ids.filter((id) => id !== p.externalId),
                          )
                        }
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded border border-gray-100 object-contain"
                        />
                        <span className="max-w-60">
                          <span className="block font-medium text-gray-900">{p.name}</span>
                          <span className="text-xs text-gray-500">
                            {p.brand || 'Brand not supplied'}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-600">
                      {p.categoryPath ?? p.categoryName}
                      {p.sourceCategoryName && (
                        <span className="mt-1 block text-gray-500">
                          Source: {p.sourceCategoryName}
                        </span>
                      )}
                      <span className="mt-1 block">
                        {p.imageCount} validated images ·{' '}
                        {Object.keys(p.specifications ?? {}).length} specifications
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {p.proposedOffer ? (
                        <>
                          {p.proposedOffer.vendorName}
                          <span className="block text-gray-500">
                            {p.proposedOffer.stockQuantity} in stock
                          </span>
                        </>
                      ) : (
                        'Draft · no offer'
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {p.pricing ? (
                        <>
                          <strong>{formatPrice(p.pricing.totalCents)}</strong>
                          <details className="mt-1 text-gray-500">
                            <summary>Price breakdown</summary>
                            <span className="block">
                              Regular {formatPrice(p.pricing.regularSubtotalCents)}
                            </span>
                            <span className="block">
                              Discounts −
                              {formatPrice(
                                p.pricing.directDiscountCents + p.pricing.automaticDiscountCents,
                              )}
                            </span>
                            <span className="block">
                              Tax {p.proposedOffer?.priceIncludesTax ? '(included)' : '(added)'}{' '}
                              {formatPrice(p.pricing.taxCents)}
                            </span>
                          </details>
                        </>
                      ) : (
                        'Not priced'
                      )}
                    </td>
                    <td className="p-3">
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-800">
                        {p.action === 'create' ? 'Eligible' : 'Already imported'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!previewRows.length && (
              <p className="p-6 text-center text-sm text-gray-500">
                {pending === 'preview'
                  ? 'Checking the first products…'
                  : 'No new products meet these filters. Choose another category or adjust your photo requirements.'}
              </p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
