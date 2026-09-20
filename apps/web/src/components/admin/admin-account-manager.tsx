'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { AdminAccountResponse } from '@/lib/api-types';

export function AdminAccountManager({ admins, currentUserId }: { admins: AdminAccountResponse[]; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await api.adminCreateAdmin(email);
        setNotice(`Admin account created for ${email} — a password-reset email was sent so they can set their own credential.`);
        setEmail('');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create admin account');
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">New admin account</h2>
        <p className="text-sm text-gray-500 mb-4">
          They receive a password-reset email to set their own credential — no password is ever shared or known by you.
        </p>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        {notice && (
          <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {notice}
          </div>
        )}
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new-admin@shopnest.dev"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Creating…' : 'Create admin'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Role</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td className="px-6 py-4 text-gray-900">
                  {admin.email}
                  {admin.id === currentUserId && <span className="text-gray-400"> (you)</span>}
                </td>
                <td className="px-6 py-4 text-gray-600">{admin.role}</td>
                <td className="px-6 py-4 text-gray-600">{admin.status}</td>
                <td className="px-6 py-4 text-gray-500">{new Date(admin.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
