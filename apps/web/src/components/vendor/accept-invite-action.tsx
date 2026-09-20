'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function AcceptInviteAction({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      try {
        await api.vendorAcceptStaffInvite(token);
        router.push('/vendor');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not accept this invite. It may have expired or already been used.');
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <button
        onClick={accept}
        disabled={isPending}
        className="px-6 py-2 bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors"
      >
        {isPending ? 'Joining…' : 'Accept invite'}
      </button>
    </div>
  );
}
