'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl?: string | null;
  isActive: boolean;
  category?: { name: string; slug: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface AdminProductListProps {
  products: Product[];
  categories: Category[];
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function AdminProductList({ products, categories }: AdminProductListProps) {
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setForm({ name: '', slug: '', description: '', priceCents: 0, stockQuantity: 0, categoryId: categories[0]?.id ?? '', imageUrl: '', isActive: true });
    setFormError(null);
    setShowCreateForm(false);
    setEditingProduct(null);
  }

  function startEdit(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description,
      priceCents: product.priceCents,
      stockQuantity: product.stockQuantity,
      categoryId: product.category ? categories.find((c) => c.slug === product.category?.slug)?.id ?? '' : '',
      imageUrl: product.imageUrl ?? '',
      isActive: product.isActive,
    });
    setShowCreateForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        const body = { ...form, priceCents: Number(form.priceCents), stockQuantity: Number(form.stockQuantity) };
        if (editingProduct) {
          await api.adminUpdateProduct(editingProduct.id, body);
        } else {
          await api.adminCreateProduct(body);
        }
        resetForm();
        router.refresh();
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : 'Operation failed');
      }
    });
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

  return (
    <div>
      {!showCreateForm && !editingProduct && (
        <button
          onClick={() => { setShowCreateForm(true); setEditingProduct(null); }}
          className="mb-6 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          + Add Product
        </button>
      )}

      {(showCreateForm || editingProduct) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editingProduct ? `Edit: ${editingProduct.name}` : 'New Product'}
          </h2>
          {formError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (cents)</label>
              <input type="number" required min={1} value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
              <input type="number" required min={0} value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL (optional)</label>
              <input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            {editingProduct && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active</label>
              </div>
            )}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={isPending}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                {isPending ? 'Saving…' : editingProduct ? 'Save Changes' : 'Create Product'}
              </button>
              <button type="button" onClick={resetForm}
                className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{product.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{product.slug}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{product.category?.name ?? '—'}</td>
                <td className="px-6 py-4 text-sm font-medium">{formatPrice(product.priceCents)}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{product.stockQuantity}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(product)} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                      Edit
                    </button>
                    <button onClick={() => handleArchive(product.id, product.name)} className="text-red-500 hover:text-red-600 text-sm font-medium">
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
