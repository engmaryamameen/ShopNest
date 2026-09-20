'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function RevokeSessionButton({ sessionId, isCurrent }: { sessionId: string; isCurrent: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRevoke() {
    const message = isCurrent
      ? 'This is your current device — revoking it will log you out here too. Continue?'
      : 'Revoke this session? That device will be signed out immediately.';
    if (!confirm(message)) return;

    startTransition(async () => {
      try {
        await api.revokeSession(sessionId);
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Failed to revoke session');
      }
    });
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isPending}
      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
