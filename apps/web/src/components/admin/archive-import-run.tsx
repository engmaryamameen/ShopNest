'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function ArchiveImportRun({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function archive() {
    setBusy(true);
    setMessage('');
    try {
      const { eligible, excluded } = await api.adminPreviewArchiveImports({ runId });
      if (!eligible) {
        setMessage('No products from this run can be archived.');
        return;
      }
      if (
        !window.confirm(
          `Archive ${eligible} imported product${eligible === 1 ? '' : 's'} from this run? Order history is retained. ${excluded ?? 0} products with independent offers are excluded.`,
        )
      )
        return;
      const result = await api.adminArchiveImports({ runId });
      setMessage(`Archived ${result.archived} product${result.archived === 1 ? '' : 's'}.`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Unable to archive products. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={archive}
        disabled={busy}
        className="text-[#0077b6] hover:text-[#005b85] disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Archive products'}
      </button>
      {message && (
        <p role="status" className="mt-1 text-xs text-slate-600">
          {message}
        </p>
      )}
    </div>
  );
}
