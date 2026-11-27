'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function UserStatusToggle({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (status === 'DEACTIVATED') {
    // Self-deactivation isn't a flow this app exposes yet — nothing for an
    // admin to toggle back from here.
    return <span className="text-sm text-gray-400">Deactivated</span>;
  }

  const next = status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  function handleToggle() {
    const message =
      next === 'SUSPENDED'
        ? 'Suspend this account? All of their active sessions will be signed out immediately.'
        : 'Reactivate this account?';
    if (!confirm(message)) return;

    startTransition(async () => {
      try {
        await api.adminUpdateUserStatus(userId, { status: next });
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Failed to update account status');
      }
    });
  }

  if (isSelf) {
    return <span className="text-sm text-gray-400">You</span>;
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
        status === 'ACTIVE'
          ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
          : 'text-green-700 hover:text-green-800 hover:bg-green-50'
      }`}
    >
      {isPending ? 'Updating…' : status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
    </button>
  );
}
