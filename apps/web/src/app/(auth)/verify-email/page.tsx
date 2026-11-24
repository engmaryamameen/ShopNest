'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import styles from '@/components/auth/auth.module.css';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

type Status = 'verifying' | 'verified' | 'already-verified' | 'invalid' | 'expired' | 'unavailable';

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
          setStatus('unavailable');
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
    unavailable: { title: 'We couldn’t verify your email', body: 'Please try opening the link again later.' },
  };

  const { title, body } = copy[status];

  return <AuthShell title={title} description={body}>
    <div role="status" aria-live="polite">
      {(status === 'invalid' || status === 'expired') && <Link href="/account/security" className={styles.link}>Request a new link</Link>}
      {(status === 'verified' || status === 'already-verified') && <Link href="/shop" className={styles.link}>Continue to ShopNest</Link>}
    </div>
  </AuthShell>;
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
