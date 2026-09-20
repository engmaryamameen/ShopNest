'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ReturnReason } from '@/lib/api-types';

const REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: 'DEFECTIVE', label: 'Item is defective' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'WRONG_ITEM', label: 'Wrong item received' },
  { value: 'NO_LONGER_NEEDED', label: 'No longer needed' },
  { value: 'OTHER', label: 'Other' },
];

export function RequestReturnButton({ orderItemId }: { orderItemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason>('DEFECTIVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.requestReturn(orderItemId, { reason, note: note || undefined });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not submit return request');
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
        Request return
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReturnReason)}
        className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        rows={2}
        maxLength={1000}
        className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {isPending ? 'Submitting…' : 'Submit request'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
