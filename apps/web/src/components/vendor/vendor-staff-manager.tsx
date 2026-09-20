'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { VendorStaffListResponse } from '@/lib/api-types';

export function VendorStaffManager({
  staff,
  currentUserId,
}: {
  staff: VendorStaffListResponse;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await api.vendorInviteStaff(email);
        setEmail('');
        setNotice(`Invite sent to ${email}.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not send invite');
      }
    });
  }

  function changeRole(memberId: string, role: 'OWNER' | 'STAFF') {
    startTransition(async () => {
      try {
        await api.vendorUpdateStaffRole(memberId, role);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not change role');
      }
    });
  }

  function revoke(memberId: string) {
    if (!confirm('Revoke this team member\'s access?')) return;
    startTransition(async () => {
      try {
        await api.vendorRevokeStaff(memberId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not revoke access');
      }
    });
  }

  function revokeInvite(inviteId: string) {
    if (!confirm('Revoke this invite? The link will stop working immediately.')) return;
    startTransition(async () => {
      try {
        await api.vendorRevokeInvite(inviteId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not revoke invite');
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Invite a team member</h2>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        {notice && (
          <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {notice}
          </div>
        )}
        <form onSubmit={invite} className="flex gap-3">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2 bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <h2 className="font-semibold text-gray-900 px-6 pt-6 pb-2">Team</h2>
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">
            {staff.members.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4 text-sm text-gray-900">{member.user.email}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-right space-x-3">
                  {member.user.id !== currentUserId && (
                    <>
                      <button
                        onClick={() => changeRole(member.id, member.role === 'OWNER' ? 'STAFF' : 'OWNER')}
                        disabled={isPending}
                        className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
                      >
                        Make {member.role === 'OWNER' ? 'staff' : 'owner'}
                      </button>
                      <button
                        onClick={() => revoke(member.id)}
                        disabled={isPending}
                        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {staff.pendingInvites.length > 0 && (
          <>
            <h2 className="font-semibold text-gray-900 px-6 pt-6 pb-2 border-t border-gray-100">Pending invites</h2>
            <table className="w-full pb-2">
              <tbody className="divide-y divide-gray-100">
                {staff.pendingInvites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="px-6 py-4 text-sm text-gray-600">{invite.email}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => revokeInvite(invite.id)}
                        disabled={isPending}
                        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                      >
                        Revoke invite
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
