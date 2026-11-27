'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminProductList } from './admin-product-list';
import { ProductViewControls, type ProductView } from './product-view-controls';
import styles from './import-workspace.module.css';
import { ToastMessage } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { ResponsiveMenu } from '@/components/ui/responsive-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { TrashIcon } from '@/components/ui/icons/trash-icon';
import { AdminInput, AdminSelect } from '@/components/ui/admin-form';
import { AdminReveal } from '@/components/ui/admin-reveal';
import type { ImportOptions, ProductListResponse } from '@/lib/api-types';
const columnNames = ['Number', 'Product', 'Created', 'Status', 'Category', 'Price', 'Stock'];
export function ImportedProductList({
  initialPage,
  options,
  importedOnly = true,
}: {
  initialPage: ProductListResponse;
  options: ImportOptions;
  importedOnly?: boolean;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    queryClient = useQueryClient();
  const runId = params.get('run') ?? '';
  const [filters, setFilters] = useState({
    q: '',
    source: '',
    categoryId: '',
    brandId: '',
    vendorId: '',
    runId: params.get('run') ?? '',
    status: '',
    sort: 'newest',
    period: '0',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const [columns, setColumns] = useState(['Product', 'Status', 'Category', 'Price', 'Stock']);
  const [view, setView] = useState<ProductView>('table'),
    [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  const [promotionId, setPromotionId] = useState(''),
    [notice, setNotice] = useState('');
  const preferenceKey = importedOnly ? 'shopnest.imported-products.view' : 'shopnest.products.view';
  function change(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    setSelected([]);
  }
  useEffect(() => {
    setFilters((current) => ({ ...current, runId }));
    setPage(1);
    setSelected([]);
  }, [runId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, q: search }));
      setPage(1);
      setSelected([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null');
      if (['table', 'grid'].includes(saved?.view)) setView(saved.view);
      if (Array.isArray(saved?.columns))
        setColumns([
          ...new Set<string>([
            'Product',
            ...saved.columns.filter((c: string) => columnNames.includes(c)),
          ]),
        ]);
    } catch {}
    setLoaded(true);
  }, [preferenceKey]);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(preferenceKey, JSON.stringify({ view, columns }));
      } catch {}
    }
  }, [loaded, preferenceKey, view, columns]);
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-product-page'] });
  }, [initialPage, queryClient]);
  const since = useMemo(
    () =>
      Number(filters.period)
        ? new Date(Date.now() - Number(filters.period) * 86400000).toISOString()
        : undefined,
    [filters.period],
  );
  const query = {
    ...filters,
    period: undefined,
    since,
    page,
    limit: 25,
    importedOnly: String(importedOnly),
  };
  const isDefault =
    page === 1 &&
    !filters.q &&
    !filters.source &&
    !filters.categoryId &&
    !filters.brandId &&
    !filters.vendorId &&
    !filters.runId &&
    !filters.status &&
    filters.sort === 'newest' &&
    filters.period === '0';
  const products = useQuery({
    queryKey: ['admin-product-page', query],
    queryFn: () => api.adminProductPage(query),
    initialData: isDefault ? initialPage : undefined,
  });
  const data = products.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  useEffect(() => {
    if (data && page > pages) setPage(pages);
  }, [data, page, pages]);
  function archiveSelected() {
    setError('');
    start(async () => {
      try {
        if (importedOnly) {
          const summary = await api.adminPreviewArchiveImports({ productIds: selected });
          if (!summary.eligible)
            throw new Error(
              'No selected products can be archived. Independent offers are protected.',
            );
          if (
            !window.confirm(
              `Archive ${summary.eligible} imported products? Independent offers are excluded and order history is preserved.`,
            )
          )
            return;
          await api.adminArchiveImports({ productIds: selected });
        } else {
          if (
            !window.confirm(
              `Archive ${selected.length} selected products? Order history is preserved.`,
            )
          )
            return;
          for (const id of selected) await api.adminArchiveProduct(id);
        }
        setSelected([]);
        await queryClient.invalidateQueries({ queryKey: ['admin-product-page'] });
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }
  function assignPromotion() {
    setError('');
    setNotice('');
    start(async () => {
      try {
        const promotion = await api.adminAssignPromotion(promotionId, selected);
        setNotice(
          promotion.productIds?.length
            ? `Promotion assigned to ${selected.length} products.`
            : 'This promotion already covers all eligible products.',
        );
        setSelected([]);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }
  const sourceLabel = (source: string) =>
    options.sources.find((item) => item.id === source)?.name ??
    source
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const filterDefinitions = [
    ...(importedOnly
      ? [
          {
            key: 'source' as const,
            label: 'Source',
            items: options.sourceFilters.map((source) => ({
              id: source,
              name: sourceLabel(source),
            })),
          },
        ]
      : []),
    { key: 'categoryId' as const, label: 'Category', items: options.categories },
    { key: 'brandId' as const, label: 'Brand', items: options.brands },
    { key: 'vendorId' as const, label: 'Vendor', items: options.managementVendors },
    ...(importedOnly
      ? [
          {
            key: 'runId' as const,
            label: 'Import run',
            items: options.runs.map((run) => ({
              id: run.id,
              name: `${new Date(run.startedAt).toLocaleDateString()} · ${sourceLabel(run.source)} · ${run.id.slice(0, 6)}`,
            })),
          },
        ]
      : []),
    {
      key: 'period' as const,
      label: 'Imported',
      items: [
        { id: '7', name: 'Last 7 days' },
        { id: '30', name: 'Last 30 days' },
        { id: '90', name: 'Last 90 days' },
      ],
    },
  ];
  const activeFilters = filterDefinitions.filter(
    (field) => filters[field.key] && filters[field.key] !== '0',
  );
  function clearFilters() {
    setSearch('');
    setFilters({
      q: '',
      source: '',
      categoryId: '',
      brandId: '',
      vendorId: '',
      runId: '',
      status: '',
      sort: 'newest',
      period: '0',
    });
    setPage(1);
    setSelected([]);
    const url = new URL(window.location.href);
    url.searchParams.delete('run');
    window.history.replaceState(null, '', url);
  }
  return (
    <section
      className={styles.list}
      aria-label={importedOnly ? 'Imported catalog' : 'Product catalog'}
    >
      <div className={styles.listHeading}>
        <h2>{products.isLoading ? 'Loading catalog…' : `${data?.total ?? 0} products`}</h2>
        {products.isFetching && !products.isLoading && <span role="status">Updating results…</span>}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <AdminInput
            aria-label="Search products"
            type="search"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={styles.control}
          aria-expanded={filtersOpen}
          aria-controls="import-product-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="2" fill="white" />
            <circle cx="15" cy="17" r="2" fill="white" />
          </svg>
          Filters{' '}
          {activeFilters.length > 0 && <span className={styles.count}>{activeFilters.length}</span>}
        </button>
        <div className={styles.toolbarEnd}>
          <div className="w-44">
            <label htmlFor="products-sort" className="sr-only">
              Sort products
            </label>
            <AdminSelect
              id="products-sort"
              value={filters.sort}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'name', label: 'Product name' },
                { value: 'price', label: 'Price: low to high' },
              ]}
              onChange={(v) => change('sort', v)}
            />
          </div>
          <ResponsiveMenu
            label="Display options"
            trigger={
              <span className={styles.control}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18M9 9v11" />
                </svg>
                <span className={styles.displayText}>Display</span>
              </span>
            }
          >
            {() => (
              <div className={styles.displayMenu}>
                <p className={styles.displayTitle}>Layout</p>
                <div className="px-2 pb-3">
                  <ProductViewControls view={view} onChange={setView} />
                </div>
                {view === 'table' && (
                  <>
                    <p className={`${styles.displayTitle} border-t border-gray-100 pt-3`}>
                      Visible columns
                    </p>
                    {columnNames.map((column) => (
                      <label key={column} className={styles.displayChoice}>
                        <Checkbox
                          checked={columns.includes(column)}
                          disabled={column === 'Product'}
                          onChange={(e) =>
                            setColumns((current) =>
                              e.target.checked
                                ? [...current, column]
                                : current.filter((c) => c !== column),
                            )
                          }
                        />
                        {column}
                        {column === 'Product' && (
                          <span className="ml-auto text-xs text-gray-400">Required</span>
                        )}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </ResponsiveMenu>
        </div>
      </div>
      <AdminReveal id="import-product-filters" open={filtersOpen}>
        <div className={styles.filterPanel}>
          {filterDefinitions.map((field) => (
            <div key={field.key}>
              <label htmlFor={`products-${field.key}`}>{field.label}</label>
              <AdminSelect
                id={`products-${field.key}`}
                value={filters[field.key]}
                options={[
                  {
                    value: field.key === 'period' ? '0' : '',
                    label: field.key === 'period' ? 'Any time' : `Any ${field.label.toLowerCase()}`,
                  },
                  ...field.items.map((item) => ({ value: item.id, label: item.name })),
                ]}
                onChange={(value) => change(field.key, value)}
              />
            </div>
          ))}
          <div className={styles.filterFooter}>
            <span>Filters apply as you choose.</span>
            <button type="button" onClick={clearFilters} className={styles.textButton}>
              Reset filters
            </button>
          </div>
        </div>
      </AdminReveal>
      {activeFilters.length > 0 && (
        <div className={styles.activeFilters} aria-label="Active filters">
          {activeFilters.map((field) => (
            <button
              type="button"
              key={field.key}
              className={styles.chip}
              aria-label={`Remove ${field.label.toLowerCase()} filter`}
              onClick={() => {
                change(field.key, field.key === 'period' ? '0' : '');
                if (field.key === 'runId') {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('run');
                  window.history.replaceState(null, '', url);
                }
              }}
            >
              <span>
                {field.label}:{' '}
                {field.items.find((item) => item.id === filters[field.key])?.name ??
                  filters[field.key].slice(0, 8)}
              </span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className={styles.textButton} onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}
      <div className={styles.statusTabs} role="group" aria-label="Product status">
        {[
          ['', 'All products'],
          ['PUBLISHED', 'Published'],
          ['DRAFT', 'Drafts'],
          ['ARCHIVED', 'Archived'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filters.status === value}
            onClick={() => change('status', value)}
          >
            {label}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div className={styles.bulk}>
          <strong className="font-medium">{selected.length} selected</strong>
          <button type="button" onClick={() => setSelected([])} className={styles.textButton}>
            Clear selection
          </button>
          <div className="w-48">
            <label htmlFor="bulk-promotion" className="sr-only">
              Promotion for selected products
            </label>
            <AdminSelect
              id="bulk-promotion"
              value={promotionId}
              options={[
                { value: '', label: 'Choose a promotion' },
                ...options.promotions.map((p) => ({ value: p.id, label: p.code })),
              ]}
              onChange={setPromotionId}
            />
          </div>
          <button
            type="button"
            disabled={pending || !promotionId}
            onClick={assignPromotion}
            className="text-[#0077b6] disabled:opacity-40"
          >
            Assign promotion
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={archiveSelected}
            className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <TrashIcon />
            Archive selected
          </button>
        </div>
      )}
      {notice && <ToastMessage title="Products updated" message={notice} tone="success" />}
      {error && <ToastMessage title="Could not update products" message={error} />}
      {products.error ? (
        <div role="alert" className={styles.empty}>
          <h3>Products could not be loaded</h3>
          <p>{products.error.message}</p>
          <button type="button" className={styles.control} onClick={() => void products.refetch()}>
            Try again
          </button>
        </div>
      ) : products.isLoading ? (
        <div role="status" className={styles.empty}>
          Loading products…
        </div>
      ) : !data?.items.length ? (
        <div className={styles.empty}>
          <h3>
            {isDefault ? 'Your imported catalog starts here' : 'No products match these filters'}
          </h3>
          <p>
            {isDefault
              ? 'Import a collection, then review and manage its products here.'
              : 'Try another search or remove a filter to see more products.'}
          </p>
          {isDefault ? (
            <Link href="/admin/imports?tab=new" className={styles.control}>
              Create an import
            </Link>
          ) : (
            <button type="button" className={styles.control} onClick={clearFilters}>
              Clear search & filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap} aria-busy={products.isFetching}>
          <AdminProductList
            products={data.items}
            categories={options.categories}
            allowCreate={!importedOnly}
            compactActions={importedOnly}
            view={view}
            selectedIds={selected}
            visibleColumns={columns}
            onSelectionChange={(id, checked) =>
              setSelected((current) =>
                checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
              )
            }
          />
        </div>
      )}
      {!!data?.items.length && (
        <div className={styles.pagination}>
          <span>
            {(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} of {data.total} products
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1 || products.isFetching}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-gray-200 px-3 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages || products.isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-gray-200 px-3 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
