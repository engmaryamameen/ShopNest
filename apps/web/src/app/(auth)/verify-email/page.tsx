'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

type Status = 'verifying' | 'verified' | 'already-verified' | 'invalid' | 'expired';

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;

    api
      .verifyEmail({ token })
      .then((result) => {
        if (!cancelled) setStatus(result.status);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 400) {
          setStatus(err.message.toLowerCase().includes('expired') ? 'expired' : 'invalid');
        } else {
          setStatus('invalid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const copy: Record<Status, { title: string; body: string }> = {
    verifying: { title: 'Verifying your email…', body: 'This will just take a moment.' },
    verified: { title: 'Email verified', body: 'Your email address has been confirmed.' },
    'already-verified': { title: 'Already verified', body: 'This email address was already confirmed.' },
    invalid: {
      title: 'This link isn’t valid',
      body: 'It may have already been used. Request a new one from your account security page.',
    },
    expired: {
      title: 'This link has expired',
      body: 'Verification links last 24 hours. Request a new one from your account security page.',
    },
  };

  const { title, body } = copy[status];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Image src="/login.avif" alt="ShopNest logo" width={64} height={64} className="mx-auto mb-6 rounded-xl" />

        {status === 'verifying' ? (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        ) : (
          <div
            className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full ${
              status === 'verified' || status === 'already-verified'
                ? 'bg-green-100 text-green-600'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {status === 'verified' || status === 'already-verified' ? '✓' : '!'}
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600">{body}</p>

        {status !== 'verifying' && (
          <Link
            href="/shop"
            className="mt-8 inline-block bg-indigo-600 text-white py-2.5 px-6 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Continue to ShopNest
          </Link>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
