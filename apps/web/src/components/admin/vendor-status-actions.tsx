'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { VendorApplicationStatus } from '@/lib/api-types';

export function VendorStatusActions({ vendorId, status }: { vendorId: string; status: VendorApplicationStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Action failed');
      }
    });
  }

  if (status === 'PENDING') {
    return (
      <div className="flex justify-end gap-3">
        <button
          onClick={() => run(() => api.adminApproveVendor(vendorId))}
          disabled={isPending}
          className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => run(() => api.adminRejectVendor(vendorId), 'Reject this vendor application?')}
          disabled={isPending}
          className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="flex justify-end">
        <button
          onClick={() =>
            run(
              () => api.adminSuspendVendor(vendorId),
              'Suspend this vendor? Their offers will stop being sellable immediately.',
            )
          }
          disabled={isPending}
          className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
        >
          Suspend
        </button>
      </div>
    );
  }

  if (status === 'SUSPENDED') {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => run(() => api.adminApproveVendor(vendorId), 'Reactivate this vendor?')}
          disabled={isPending}
          className="text-emerald-700 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
        >
          Reactivate
        </button>
      </div>
    );
  }

  return <span className="text-sm text-gray-400">—</span>;
}
