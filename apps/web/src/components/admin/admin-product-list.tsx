'use client';
import { OfferPricingFields, DEFAULT_PRICING } from '@/components/shared/offer-pricing-fields';
import type { PricingSettings } from '@/lib/api-types';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ProductCardResponse, ProductDetailResponse, CategoryResponse } from '@/lib/api-types';
import { ProductVariantsEditor } from './product-variants-editor';
import { formatPrice } from '@/lib/format-price';
import type { ProductView } from './product-view-controls';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminInput, AdminSelect, AdminSwitch } from '@/components/ui/admin-form';
import { ProductDescriptionEditor } from '@/components/product/product-description-editor';
import { ProductDescription } from '@/components/product/product-description';
import { ProductImageGallery } from './product-image-gallery';
import { EditIcon } from '@/components/ui/icons/edit-icon';
import { TrashIcon } from '@/components/ui/icons/trash-icon';
import { ResponsiveMenu } from '@/components/ui/responsive-menu';
import drawerStyles from './product-details-drawer.module.css';
import tableStyles from './product-table.module.css';
import { categoryOptions } from '@/lib/category-tree';

type Product = ProductCardResponse;
type Category = CategoryResponse;

const STATUS_LABELS: Record<Product['publishStatus'], string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

const STATUS_BADGES: Record<Product['publishStatus'], string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-600',
};

interface AdminProductListProps {
  products: Product[];
  categories: Category[];
  allowCreate?: boolean;
  selectedIds?: string[];
  visibleColumns?: string[];
  view?: ProductView;
  compactActions?: boolean;
  onSelectionChange?: (id: string, selected: boolean) => void;
}

export function AdminProductList({
  products,
  categories,
  allowCreate = true,
  selectedIds,
  onSelectionChange,
  view = 'table',
  compactActions = false,
  visibleColumns = ['Product', 'Category', 'Price', 'Stock', 'Status'],
}: AdminProductListProps) {
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesChanged, setImagesChanged] = useState(false);
  const [imagesUnavailable, setImagesUnavailable] = useState(false);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [detailsClosing, setDetailsClosing] = useState(false);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [editClosing, setEditClosing] = useState(false);
  useEffect(() => {
    if ((showCreateForm || editingProduct) && !editDialog.current?.open)
      editDialog.current?.showModal();
  }, [showCreateForm, editingProduct]);
  function closeEdit() {
    if (editDialog.current?.open) setEditClosing(true);
  }
  useEffect(() => {
    if (detailsProduct && !detailsDialog.current?.open) detailsDialog.current?.showModal();
  }, [detailsProduct]);
  useEffect(() => {
    if (!showCreateForm && !editingProduct && !detailsProduct) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
      root.style.scrollbarGutter = previousGutter;
    };
  }, [showCreateForm, editingProduct, detailsProduct]);
  function closeDetails() {
    if (detailsDialog.current?.open) setDetailsClosing(true);
  }
  const selectedVisible = products.filter((product) => selectedIds?.includes(product.id)).length;

  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [brandId, setBrandId] = useState('');
  const [productType, setProductType] = useState('');
  const [specifications, setSpecifications] = useState<Array<{ name: string; value: string }>>([]);
  const [specificationsChanged, setSpecificationsChanged] = useState(false);
  const [loadedDetails, setLoadedDetails] = useState<ProductDetailResponse | null>(null);
  useEffect(() => {
    api
      .listBrands()
      .then(setBrands)
      .catch(() => {});
  }, []);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    priceCents: 0,
    stockQuantity: 0,
    categoryId: categories[0]?.id ?? '',
    imageUrl: '',
    isActive: true,
  });

  function resetForm() {
    setForm({
      name: '',
      slug: '',
      description: '',
      priceCents: 0,
      stockQuantity: 0,
      categoryId: categories[0]?.id ?? '',
      imageUrl: '',
      isActive: true,
    });
    setFormError(null);
    setPricing(DEFAULT_PRICING);
    setBrandId('');
    setProductType('');
    setSpecifications([]);
    setSpecificationsChanged(false);
    setShowCreateForm(false);
    setEditingProduct(null);
    setImages([]);
    setImagesChanged(false);
    setImagesUnavailable(false);
  }

  function startEdit(product: Product) {
    setLoadedDetails(null);
    setBrandId(product.brand?.id ?? '');
    setProductType(product.productType ?? '');
    setSpecifications([]);
    setSpecificationsChanged(false);
    setEditingProduct(product);
    setPricing({
      ...DEFAULT_PRICING,
      ...product.pricingSettings,
      ...(product.compareAtPriceCents != null
        ? {
            discountEnabled: true,
            discountType: 'FIXED_AMOUNT',
            discountValue: product.compareAtPriceCents - product.priceCents,
          }
        : {}),
    });
    setImages([]);
    setImagesChanged(false);
    setImagesLoading(true);
    setImagesUnavailable(false);
    api
      .adminProductDetails(product.id)
      .then((details) => {
        setLoadedDetails(details);
        setImages(details.images.map((image) => image.url));
        setSpecifications(
          details.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value })),
        );
      })
      .catch(() => {
        setImagesUnavailable(true);
        setFormError('Unable to load product details. Close the editor and try again.');
      })
      .finally(() => setImagesLoading(false));
    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description,
      priceCents: product.compareAtPriceCents ?? product.priceCents,
      stockQuantity: product.stockQuantity,
      categoryId: product.category
        ? (categories.find((c) => c.slug === product.category?.slug)?.id ?? '')
        : '',
      imageUrl: product.imageUrl ?? '',
      isActive: product.publishStatus === 'PUBLISHED',
    });
    setShowCreateForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.description.trim().length < 10) {
      setFormError('Please enter a product description of at least 10 characters.');
      return;
    }
    startTransition(async () => {
      try {
        const { isActive, imageUrl, slug, ...fields } = form;
        const body = {
          ...fields,
          ...pricing,
          brandId: brandId || null,
          productType,
          ...(specificationsChanged
            ? {
                specifications: Object.fromEntries(
                  specifications.filter((s) => s.name.trim()).map((s) => [s.name.trim(), s.value]),
                ),
              }
            : {}),
          ...(!editingProduct || imagesChanged ? { imageUrls: images } : {}),
          priceCents: Number(form.priceCents),
          compareAtPriceCents: null,
          stockQuantity: Number(form.stockQuantity),
        };
        if (editingProduct) {
          await api.adminUpdateProduct(editingProduct.id, {
            ...body,
            offerId: editingProduct.offerId ?? undefined,
            ...(isActive !== (editingProduct.publishStatus === 'PUBLISHED') ? { isActive } : {}),
          });
        } else {
          await api.adminCreateProduct(body);
        }
        closeEdit();
        router.refresh();
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : 'Operation failed');
      }
    });
  }

  function handleImageUpload(file: File, index?: number) {
    setIsUploading(true);
    setFormError(null);
    api
      .uploadMedia(file)
      .then(({ url }) => {
        setImages((previous) =>
          index === undefined
            ? [...previous, url]
            : previous.map((item, i) => (i === index ? url : item)),
        );
        setImagesChanged(true);
      })
      .catch((err) => setFormError(err instanceof ApiError ? err.message : 'Upload failed'))
      .finally(() => setIsUploading(false));
  }

  function handleArchive(productId: string, name: string) {
    if (!confirm(`Archive "${name}"? It will be hidden from the public catalog.`)) return;
    startTransition(async () => {
      try {
        await api.adminArchiveProduct(productId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Archive failed');
      }
    });
  }

  function renderActions(product: Product) {
    if (compactActions)
      return (
        <ResponsiveMenu
          portal
          label={`Actions for ${product.name}`}
          trigger={
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-gray-100">
              ···
            </span>
          }
        >
          {(close) => (
            <div className="min-w-40 space-y-1 text-sm">
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-gray-50"
                onClick={() => {
                  close();
                  setDetailsProduct(product);
                }}
              >
                View details
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-gray-50"
                onClick={() => {
                  close();
                  startEdit(product);
                }}
              >
                Edit product
              </button>
              <button
                type="button"
                disabled={isPending}
                className="block w-full rounded-md px-3 py-2 text-left text-red-700 hover:bg-red-50 disabled:opacity-50"
                onClick={() => {
                  close();
                  handleArchive(product.id, product.name);
                }}
              >
                Archive product
              </button>
            </div>
          )}
        </ResponsiveMenu>
      );
    return (
      <div className="flex items-center gap-0">
        {onSelectionChange && (
          <button
            type="button"
            aria-label={`View details for ${product.name}`}
            onClick={() => setDetailsProduct(product)}
            className="inline-flex h-9 w-7 items-center justify-center rounded-lg text-slate-600 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 5h5v5M19 5l-8 8M5 13h6v6H5z" />
            </svg>
          </button>
        )}
        {onSelectionChange ? (
          <>
            <button
              type="button"
              aria-label={`Edit ${product.name}`}
              title="Edit"
              onClick={() => startEdit(product)}
              className="inline-flex h-9 w-7 items-center justify-center rounded-lg text-slate-600 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
            >
              <EditIcon />
            </button>
            <button
              type="button"
              aria-label={`Archive ${product.name}`}
              title="Archive"
              onClick={() => handleArchive(product.id, product.name)}
              className="inline-flex h-9 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
            >
              <TrashIcon />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Edit ${product.name}`}
              title="Edit"
              onClick={() => startEdit(product)}
              className="inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => handleArchive(product.id, product.name)}
              className="text-red-500 hover:text-red-600 text-sm font-medium"
            >
              Archive
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {allowCreate && !showCreateForm && !editingProduct && (
        <button
          onClick={() => {
            setShowCreateForm(true);
            setEditingProduct(null);
          }}
          className="mb-6 px-4 py-2 shopnest-primary rounded-lg font-medium  transition-colors"
        >
          + Add Product
        </button>
      )}

      <dialog
        ref={editDialog}
        aria-labelledby="product-edit-title"
        aria-describedby={editingProduct ? 'product-edit-name' : undefined}
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          setEditClosing(false);
          resetForm();
        }}
        onCancel={(event) => {
          // File inputs also emit cancel when the native picker is dismissed.
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          closeEdit();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeEdit();
        }}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && editClosing) editDialog.current?.close();
        }}
        data-closing={editClosing || undefined}
        className={`${drawerStyles.drawer} ${drawerStyles.editor} fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-md border-0 bg-white p-0 shadow-xl`}
      >
        {(showCreateForm || editingProduct) && (
          <div className="flex min-h-full flex-col">
            <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
              <div className="min-w-0">
                <h2 id="product-edit-title" className="text-lg font-semibold text-gray-900">
                  {editingProduct ? 'Edit product' : 'New product'}
                </h2>
                {editingProduct && (
                  <p
                    id="product-edit-name"
                    title={editingProduct.name}
                    className="mt-1 line-clamp-2 break-words text-sm text-gray-600"
                  >
                    {editingProduct.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close product editor"
                onClick={closeEdit}
                className="shrink-0 rounded p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
              >
                ✕
              </button>
            </header>
            <div className="p-6">
              {formError && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="min-w-0 space-y-6">
                    <section className="space-y-4" aria-labelledby="product-basic-heading">
                      <h3
                        id="product-basic-heading"
                        className="text-base font-semibold text-gray-900"
                      >
                        Basic details
                      </h3>
                      <div>
                        <label
                          htmlFor="product-name"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Product name
                        </label>
                        <AdminInput
                          variant="product"
                          id="product-name"
                          required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </div>
                      <ProductDescriptionEditor
                        value={form.description}
                        onChange={(description) => setForm({ ...form, description })}
                      />
                    </section>
                    <section
                      className="space-y-4 border-t border-gray-100 pt-5"
                      aria-labelledby="product-pricing-heading"
                    >
                      <h3
                        id="product-pricing-heading"
                        className="text-base font-semibold text-gray-900"
                      >
                        Pricing
                      </h3>
                      <div>
                        <label
                          htmlFor="product-price"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Regular price (USD)
                        </label>
                        <AdminInput
                          variant="product"
                          id="product-price"
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={form.priceCents / 100}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              priceCents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </div>
                      <OfferPricingFields
                        value={pricing}
                        onChange={setPricing}
                        priceCents={form.priceCents}
                        context={{
                          productId: editingProduct?.id,
                          vendorId: editingProduct?.vendorId,
                          brandId: brandId || null,
                          categoryId: form.categoryId || undefined,
                          productType,
                        }}
                      />
                    </section>
                    <section
                      className="space-y-4 border-t border-gray-100 pt-5"
                      aria-labelledby="product-inventory-heading"
                    >
                      <h3
                        id="product-inventory-heading"
                        className="text-base font-semibold text-gray-900"
                      >
                        Inventory
                      </h3>
                      <div>
                        <label
                          htmlFor="product-stock"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Stock quantity
                        </label>
                        <AdminInput
                          variant="product"
                          id="product-stock"
                          type="number"
                          required
                          min={0}
                          value={form.stockQuantity}
                          onChange={(e) =>
                            setForm({ ...form, stockQuantity: Number(e.target.value) })
                          }
                        />
                      </div>
                    </section>
                  </div>
                  <div className="min-w-0">
                    <ProductImageGallery
                      images={images}
                      disabled={isUploading || imagesLoading || imagesUnavailable}
                      onUpload={handleImageUpload}
                      onRemove={(index) => {
                        setImages((current) => current.filter((_, i) => i !== index));
                        setImagesChanged(true);
                      }}
                    />
                    <section className="mt-6 space-y-3" aria-labelledby="product-catalog-heading">
                      <h3
                        id="product-catalog-heading"
                        className="text-base font-semibold text-gray-900"
                      >
                        Categories
                      </h3>
                      <div>
                        <label
                          htmlFor="product-category"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Product category
                        </label>
                        <AdminSelect
                          variant="product"
                          id="product-category"
                          value={form.categoryId}
                          options={categoryOptions(categories).map((category) => ({
                            value: category.id,
                            label: category.path,
                          }))}
                          onChange={(categoryId) => setForm({ ...form, categoryId })}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="product-brand"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Brand
                        </label>
                        <AdminSelect
                          id="product-brand"
                          value={brandId}
                          options={[
                            { value: '', label: 'No brand assigned' },
                            ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
                          ]}
                          onChange={setBrandId}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="product-type"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          Product type
                        </label>
                        <AdminInput
                          id="product-type"
                          value={productType}
                          onChange={(e) => setProductType(e.target.value)}
                        />
                      </div>
                    </section>
                    <section className="mt-6 space-y-3">
                      <h3 className="text-base font-semibold text-gray-900">Specifications</h3>
                      {specifications.map((specification, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <AdminInput
                            aria-label={`Specification ${index + 1} name`}
                            placeholder="Name"
                            value={specification.name}
                            onChange={(e) => {
                              setSpecifications((current) =>
                                current.map((s, i) =>
                                  i === index ? { ...s, name: e.target.value } : s,
                                ),
                              );
                              setSpecificationsChanged(true);
                            }}
                          />
                          <AdminInput
                            aria-label={`Specification ${index + 1} value`}
                            placeholder="Value"
                            value={specification.value}
                            onChange={(e) => {
                              setSpecifications((current) =>
                                current.map((s, i) =>
                                  i === index ? { ...s, value: e.target.value } : s,
                                ),
                              );
                              setSpecificationsChanged(true);
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`Remove specification ${index + 1}`}
                            onClick={() => {
                              setSpecifications((current) => current.filter((_, i) => i !== index));
                              setSpecificationsChanged(true);
                            }}
                            className="p-2 text-slate-500 hover:text-red-600"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={specifications.length >= 50}
                        onClick={() => {
                          setSpecifications((current) => [...current, { name: '', value: '' }]);
                          setSpecificationsChanged(true);
                        }}
                        className="text-sm font-medium text-[#0077b6]"
                      >
                        Add specification
                      </button>
                    </section>
                  </div>
                </div>
                {editingProduct && loadedDetails && (
                  <ProductVariantsEditor
                    key={editingProduct.id}
                    product={loadedDetails}
                    vendorId={editingProduct.vendorId}
                    pricing={pricing}
                    onSaved={(details) => {
                      const offer =
                        details.offers.find((o) => o.id === editingProduct.offerId) ??
                        details.offers[0];
                      if (offer) {
                        setEditingProduct((current) =>
                          current
                            ? { ...current, offerId: offer.id, vendorId: offer.vendor.id }
                            : current,
                        );
                        setForm((current) => ({
                          ...current,
                          priceCents: offer.priceCents,
                          stockQuantity: offer.stockQuantity,
                        }));
                      }
                      setLoadedDetails(details);
                    }}
                  />
                )}
                {editingProduct && (
                  <AdminSwitch
                    label="Published (visible in the storefront)"
                    checked={form.isActive}
                    onChange={(isActive) => setForm({ ...form, isActive })}
                  />
                )}
                <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
                  <button
                    type="submit"
                    disabled={isPending || isUploading || imagesLoading || !form.categoryId}
                    className="rounded-lg px-6 py-2 font-medium shopnest-primary transition-colors disabled:opacity-60"
                  >
                    {isPending ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                  </button>
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="rounded-lg border border-gray-300 px-6 py-2 font-medium transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </dialog>

      {view === 'grid' && onSelectionChange ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <Checkbox
                  aria-label={`Select ${product.name}`}
                  checked={selectedIds?.includes(product.id) ?? false}
                  onChange={(event) => onSelectionChange(product.id, event.target.checked)}
                />
                <span
                  className={`rounded-full px-2 py-1 text-xs ${STATUS_BADGES[product.publishStatus]}`}
                >
                  {STATUS_LABELS[product.publishStatus]}
                </span>
              </div>
              <div className="mt-3 flex h-36 items-center justify-center rounded-lg bg-gray-50">
                {product.imageUrl && (
                  <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
                )}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">{product.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{product.category?.name ?? '—'}</p>
              <div className="mt-3 flex items-center justify-between text-sm text-gray-700">
                <span>{product.offerId ? formatPrice(product.priceCents) : 'Not priced'}</span>
                <span>
                  {product.offerId ? `${product.stockQuantity} in stock` : 'Stock unavailable'}
                </span>
              </div>
              <div className="mt-2 flex justify-end">{renderActions(product)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div
          className={`${tableStyles.scrollArea} overflow-x-auto rounded-xl border border-gray-200 bg-white`}
          role="region"
          aria-label="Products table"
          tabIndex={0}
        >
          <table
            className={`w-full ${onSelectionChange ? (visibleColumns.includes('Price') || visibleColumns.includes('Stock') ? 'min-w-[960px]' : 'min-w-[680px]') : ''}`}
          >
            <thead
              className={`${onSelectionChange ? 'bg-[var(--overview-surface-blue)]' : 'bg-gray-50'} border-b border-gray-200`}
            >
              <tr>
                {onSelectionChange && (
                  <th className="px-4 py-3 text-left">
                    <Checkbox
                      aria-label="Select all visible products"
                      checked={products.length > 0 && selectedVisible === products.length}
                      indeterminate={selectedVisible > 0 && selectedVisible < products.length}
                      disabled={products.length === 0}
                      onChange={(event) =>
                        products.forEach((product) =>
                          onSelectionChange(product.id, event.target.checked),
                        )
                      }
                    />
                  </th>
                )}
                {onSelectionChange && visibleColumns.includes('Number') && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                )}
                {visibleColumns.includes('Product') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Product
                  </th>
                )}
                {onSelectionChange && visibleColumns.includes('Created') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                )}
                {onSelectionChange && visibleColumns.includes('Status') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                )}
                {visibleColumns.includes('Category') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                )}
                {visibleColumns.includes('Price') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Price
                  </th>
                )}
                {visibleColumns.includes('Stock') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Stock
                  </th>
                )}
                {!onSelectionChange && visibleColumns.includes('Status') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                )}
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product, index) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  {onSelectionChange && (
                    <td className="px-4 py-4">
                      <Checkbox
                        aria-label={`Select ${product.name}`}
                        checked={selectedIds?.includes(product.id) ?? false}
                        onChange={(event) => onSelectionChange(product.id, event.target.checked)}
                      />
                    </td>
                  )}
                  {onSelectionChange && visibleColumns.includes('Number') && (
                    <td className="px-4 py-4 text-sm text-gray-600">{index + 1}</td>
                  )}
                  {visibleColumns.includes('Product') && (
                    <td className="px-6 py-4">
                      {onSelectionChange ? (
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            )}
                          </div>
                          {compactActions ? (
                            <button
                              type="button"
                              aria-label={`View details for ${product.name}`}
                              onClick={() => setDetailsProduct(product)}
                              className="text-left text-sm text-gray-900 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
                            >
                              {product.name}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-900">{product.name}</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{product.slug}</p>
                        </>
                      )}
                    </td>
                  )}
                  {onSelectionChange && visibleColumns.includes('Created') && (
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {new Intl.DateTimeFormat('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }).format(new Date(product.createdAt))}
                    </td>
                  )}
                  {onSelectionChange && visibleColumns.includes('Status') && (
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[product.publishStatus]}`}
                      >
                        {STATUS_LABELS[product.publishStatus]}
                      </span>
                    </td>
                  )}
                  {visibleColumns.includes('Category') && (
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {product.category?.name ?? '—'}
                    </td>
                  )}
                  {visibleColumns.includes('Price') && (
                    <td className="px-6 py-4 text-sm font-medium">
                      {product.offerId ? (
                        formatPrice(product.priceCents)
                      ) : (
                        <span className="text-gray-400 font-normal">Not priced</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.includes('Stock') && (
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {product.offerId ? product.stockQuantity : '—'}
                    </td>
                  )}
                  {!onSelectionChange && visibleColumns.includes('Status') && (
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[product.publishStatus]}`}
                      >
                        {STATUS_LABELS[product.publishStatus]}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4">{renderActions(product)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dialog
        ref={detailsDialog}
        aria-labelledby="import-product-details-title"
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          setDetailsProduct(null);
          setDetailsClosing(false);
        }}
        onCancel={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          closeDetails();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDetails();
        }}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && detailsClosing)
            detailsDialog.current?.close();
        }}
        data-closing={detailsClosing || undefined}
        className={`${drawerStyles.drawer} fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-md border-0 bg-white p-0 shadow-xl`}
      >
        {detailsProduct && (
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="import-product-details-title" className="text-lg font-semibold text-gray-900">
                Product details
              </h2>
              <button
                type="button"
                aria-label="Close product details"
                onClick={closeDetails}
                className="rounded p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
              >
                ✕
              </button>
            </header>
            <div className="overflow-y-auto p-6 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{detailsProduct.name}</h3>
              {detailsProduct.imageUrl && (
                <img
                  src={detailsProduct.imageUrl}
                  alt=""
                  className="mt-5 h-40 w-full rounded-lg bg-gray-50 object-contain"
                />
              )}
              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-gray-500">Category</dt>
                  <dd className="mt-1 text-gray-900">{detailsProduct.category?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Brand</dt>
                  <dd className="mt-1 text-gray-900">{detailsProduct.brand?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="mt-1 text-gray-900">
                    {STATUS_LABELS[detailsProduct.publishStatus]}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Price</dt>
                  <dd className="mt-1 text-gray-900">
                    {detailsProduct.offerId ? formatPrice(detailsProduct.priceCents) : 'Not priced'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Stock</dt>
                  <dd className="mt-1 text-gray-900">
                    {detailsProduct.offerId ? detailsProduct.stockQuantity : '—'}
                  </dd>
                </div>
              </dl>
              <h4 className="mt-6 font-medium text-gray-900">Description</h4>
              <ProductDescription
                className="mt-2 text-gray-600"
                value={detailsProduct.description || 'No description available.'}
              />
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
