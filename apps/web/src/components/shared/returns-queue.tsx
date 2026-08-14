'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ReturnRequestResponse } from '@/lib/api-types';

const REASON_LABELS: Record<string, string> = {
  DEFECTIVE: 'Defective',
  NOT_AS_DESCRIBED: 'Not as described',
  WRONG_ITEM: 'Wrong item',
  NO_LONGER_NEEDED: 'No longer needed',
  OTHER: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  REFUNDED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-gray-100 text-gray-600',
};

interface ReturnsQueueProps {
  returns: ReturnRequestResponse[];
  /** Which endpoint family to call — the two are otherwise identical. */
  scope: 'vendor' | 'admin';
  /** Admin sees every vendor's queue in one list — shown to disambiguate rows. */
  showVendor?: boolean;
}

export function ReturnsQueue({ returns, scope, showVendor = false }: ReturnsQueueProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  function decide(action: 'approve' | 'reject', id: string) {
    setError(null);
    setDecidingId(id);
    startTransition(async () => {
      try {
        const call = scope === 'vendor'
          ? (action === 'approve' ? api.vendorApproveReturn : api.vendorRejectReturn)
          : (action === 'approve' ? api.adminApproveReturn : api.adminRejectReturn);
        await call(id, {});
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not decide this return');
      } finally {
        setDecidingId(null);
      }
    });
  }

  if (returns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-500">
        No return requests.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {error && <div className="px-6 py-3 text-sm text-red-600 bg-red-50 border-b border-red-200">{error}</div>}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left font-medium text-gray-500">Item</th>
            {showVendor && <th className="px-6 py-3 text-left font-medium text-gray-500">Vendor</th>}
            <th className="px-6 py-3 text-left font-medium text-gray-500">Customer</th>
            <th className="px-6 py-3 text-left font-medium text-gray-500">Reason</th>
            <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
            <th className="px-6 py-3 text-right font-medium text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {returns.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-6 py-4">
                <p className="font-medium text-gray-900">{r.orderItem?.productName}</p>
                <p className="text-xs text-gray-400">× {r.orderItem?.quantity}</p>
                {r.note && <p className="text-xs text-gray-500 mt-1">“{r.note}”</p>}
              </td>
              {showVendor && <td className="px-6 py-4 text-gray-600">{r.orderItem?.vendorName}</td>}
              <td className="px-6 py-4 text-gray-600">{r.user?.email}</td>
              <td className="px-6 py-4 text-gray-600">{REASON_LABELS[r.reason] ?? r.reason}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                {r.decisionNote && <p className="text-xs text-gray-400 mt-1">{r.decisionNote}</p>}
              </td>
              <td className="px-6 py-4 text-right">
                {r.status === 'REQUESTED' && (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => decide('approve', r.id)}
                      disabled={isPending && decidingId === r.id}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide('reject', r.id)}
                      disabled={isPending && decidingId === r.id}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
