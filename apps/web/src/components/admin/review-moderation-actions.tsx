'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function ReviewModerationActions({ id, status }: { id: string; status: 'PUBLISHED' | 'HIDDEN' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Action failed');
      }
    });
  }

  if (status === 'PUBLISHED') {
    return (
      <button
        onClick={() => run(() => api.adminHideReview(id))}
        disabled={isPending}
        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
      >
        Hide
      </button>
    );
  }

  return (
    <button
      onClick={() => run(() => api.adminPublishReview(id))}
      disabled={isPending}
      className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
    >
      Publish
    </button>
  );
}
