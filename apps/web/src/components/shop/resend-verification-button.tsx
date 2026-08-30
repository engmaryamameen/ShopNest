'use client';

import { useState, useTransition } from 'react';
import { api, ApiError } from '@/lib/api';

export function ResendVerificationButton({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function handleResend() {
    startTransition(async () => {
      try {
        await api.resendVerification({ email });
        setSent(true);
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Failed to resend verification email');
      }
    });
  }

  if (sent) {
    return <span className="shrink-0 text-sm font-medium text-amber-800">Email sent — check your inbox</span>;
  }

  return (
    <button
      onClick={handleResend}
      disabled={isPending}
      className="shrink-0 px-4 py-2 bg-amber-900 text-white rounded-lg text-sm font-medium hover:bg-amber-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? 'Sending…' : 'Resend email'}
    </button>
  );
}
