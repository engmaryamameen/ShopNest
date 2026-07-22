'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
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
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit state — one row at a time
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
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
        await api.adminCreateCategory({ name: createName });
        setCreateName('');
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
        await api.adminUpdateCategory(id, { name: editName });
        cancelEdit();
        router.refresh();
      } catch (err) {
        setEditError(err instanceof ApiError ? err.message : 'Update failed');
      }
    });
  }

  function handleDelete(category: Category) {
    if (!confirm(`Delete category "${category.name}"? This will fail if any products still reference it.`)) return;
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
          onClick={() => { setShowCreate(true); cancelEdit(); }}
          className="mb-6 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
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
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              required
              placeholder="Category name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateName(''); setCreateError(null); }}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slug</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {editingId === cat.id ? (
                      <div>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                        />
                        {editError && (
                          <p className="mt-1 text-xs text-red-600">{editError}</p>
                        )}
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900">{cat.name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400 font-mono">{cat.slug}</td>
                  <td className="px-6 py-4">
                    {editingId === cat.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleUpdate(cat.id)}
                          disabled={isPending}
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
                          className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          disabled={isPending}
                          className="text-red-500 hover:text-red-600 text-sm font-medium disabled:opacity-50"
                        >
                          Delete
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
