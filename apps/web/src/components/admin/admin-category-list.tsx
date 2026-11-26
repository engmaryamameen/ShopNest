'use client';
import { AdminInput, AdminSelect } from '@/components/ui/admin-form';

import { EditIcon } from '@/components/ui/icons/edit-icon';
import { TrashIcon } from '@/components/ui/icons/trash-icon';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { categoryOptions } from '@/lib/category-tree';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  position?: number;
  isActive?: boolean;
  imageUrl?: string | null;
}

interface AdminCategoryListProps {
  categories: Category[];
}

export function AdminCategoryList({ categories }: AdminCategoryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState('');
  const [createImage, setCreateImage] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit state — one row at a time
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParent, setEditParent] = useState('');
  const [editImage, setEditImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const rows = categoryOptions(categories, true);
  const parents = categoryOptions(categories);

  async function upload(file: File | undefined, editing: boolean) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadMedia(file);
      if (editing) setEditImage(result.url);
      else setCreateImage(result.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      if (editing) setEditError(message);
      else setCreateError(message);
    } finally {
      setUploading(false);
    }
  }
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditParent(category.parentId ?? '');
    setEditImage(category.imageUrl ?? '');
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    startTransition(async () => {
      try {
        await api.adminCreateCategory({
          name: createName,
          ...(createParent ? { parentId: createParent } : {}),
          ...(createImage ? { imageUrl: createImage } : {}),
        });
        setCreateName('');
        setCreateParent('');
        setCreateImage('');
        setShowCreate(false);
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof ApiError ? err.message : 'Create failed');
      }
    });
  }

  function handleUpdate(id: string) {
    setEditError(null);
    startTransition(async () => {
      try {
        const existingImage = categories.find((category) => category.id === id)?.imageUrl ?? '';
        await api.adminUpdateCategory(id, {
          name: editName,
          parentId: editParent || null,
          ...(editImage && editImage !== existingImage ? { imageUrl: editImage } : {}),
        });
        cancelEdit();
        router.refresh();
      } catch (err) {
        setEditError(err instanceof ApiError ? err.message : 'Update failed');
      }
    });
  }

  function handleDelete(category: Category) {
    if (
      !confirm(
        `Delete category "${category.name}"? This will fail if any products still reference it.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await api.adminDeleteCategory(category.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Delete failed');
      }
    });
  }

  return (
    <div>
      {!showCreate && (
        <button
          onClick={() => {
            setShowCreate(true);
            cancelEdit();
          }}
          className="mb-6 px-4 py-2 shopnest-primary rounded-lg font-medium  transition-colors"
        >
          + Add Category
        </button>
      )}

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">New Category</h2>
          {createError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 space-y-1 text-sm text-gray-700">
              <span className="block">Name</span>
              <AdminInput
                aria-label="Category name"
                required
                placeholder="Category name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="min-w-0 flex-1"
              />
            </label>
            <div className="min-w-56 flex-1 space-y-1 text-sm text-gray-700">
              <label htmlFor="create-category-parent" className="block">
                Parent category
              </label>
              <AdminSelect
                id="create-category-parent"
                value={createParent}
                onChange={setCreateParent}
                options={[
                  { value: '', label: 'Main category' },
                  ...parents.map((category) => ({ value: category.id, label: category.path })),
                ]}
              />
            </div>
            <label className="min-w-56 flex-1 space-y-1 text-sm text-gray-700">
              <span className="block">
                {createParent ? 'Category image (optional)' : 'Main category image'}
              </span>
              <AdminInput
                aria-label="New category image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void upload(event.target.files?.[0], false)}
              />
            </label>
            {createImage && (
              <img
                src={createImage}
                alt="New category preview"
                className="h-10 w-10 rounded object-contain"
              />
            )}
            <button
              type="submit"
              disabled={isPending || uploading}
              className="px-6 py-2 shopnest-primary rounded-lg font-medium  disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateName('');
                setCreateParent('');
                setCreateImage('');
                setCreateError(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {categories.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No categories yet. Add one to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Parent category
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {editingId === cat.id ? (
                      <div>
                        <AdminInput
                          aria-label={`Edit category ${cat.name}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <div className="mt-2 space-y-2">
                          <label
                            htmlFor={`parent-${cat.id}`}
                            className="block text-xs text-gray-600"
                          >
                            Parent category
                          </label>
                          <AdminSelect
                            id={`parent-${cat.id}`}
                            value={editParent}
                            onChange={setEditParent}
                            options={[
                              { value: '', label: 'Main category' },
                              ...parents
                                .filter(
                                  (category) =>
                                    category.id !== cat.id &&
                                    !category.path.startsWith(cat.path + ' → '),
                                )
                                .map((category) => ({ value: category.id, label: category.path })),
                            ]}
                          />
                          <label className="block space-y-1 text-xs text-gray-600">
                            <span>Category image</span>
                            <AdminInput
                              type="file"
                              aria-label={`Image for ${cat.name}`}
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) => void upload(event.target.files?.[0], true)}
                            />
                          </label>
                          {editImage && (
                            <img
                              src={editImage}
                              alt="Category preview"
                              className="h-12 w-12 object-contain"
                            />
                          )}
                        </div>
                        {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
                      </div>
                    ) : (
                      <span
                        className="flex items-center gap-3 font-medium text-gray-900"
                        style={{ paddingLeft: cat.depth * 16 }}
                        title={cat.path}
                      >
                        {cat.imageUrl && (
                          <img
                            src={cat.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 object-contain"
                          />
                        )}
                        {cat.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400 font-mono">{cat.slug}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {parents.find((parent) => parent.id === cat.parentId)?.path ?? 'Main category'}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === cat.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleUpdate(cat.id)}
                          disabled={isPending || uploading}
                          className="text-indigo-600 hover:text-indigo-700 text-sm font-medium disabled:opacity-50"
                        >
                          {isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(cat)}
                          aria-label={`Edit ${cat.name}`}
                          title="Edit category"
                          className="inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:text-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          disabled={isPending}
                          aria-label={`Delete ${cat.name}`}
                          title="Delete"
                          className="inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:opacity-50"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
