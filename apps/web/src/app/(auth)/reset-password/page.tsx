'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordField, Feedback, PrimaryButton } from '@/components/auth/auth-fields';
import styles from '@/components/auth/auth.module.css';
import { ToastMessage } from '@/components/ui/toast';
import Link from 'next/link';
import { passwordError, confirmationError } from '@/components/auth/password-validation';
import { api, ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing its token — request a new one.');
      return;
    }
    setAttempted(true);
    if (passwordError(password, true)) { document.getElementById('password')?.focus(); return; }
    if (confirmationError(confirm, password, true)) { document.getElementById('confirm')?.focus(); return; }

    startTransition(async () => {
      try {
        await api.resetPassword({ token, newPassword: password });
        router.push('/login?reset=success');
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred');
        }
      }
    });
  }

  return <AuthShell title="Choose a new password" description="Changing your password signs you out on every device.">
    {!token && <Feedback kind="error">This link is missing its reset token. <Link href="/forgot-password" className={styles.link}>Request a new one</Link>.</Feedback>}
    <form onSubmit={handleSubmit} className={`${styles.form} ${styles.loginForm}`} noValidate>
      {error && <ToastMessage message={error} />}
      <PasswordField id="password" label="New password" error={(attempted || touched.password) ? passwordError(password, attempted) : undefined} onBlur={() => setTouched((t) => ({ ...t, password: !!password }))} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
      <PasswordField id="confirm" label="Confirm new password" error={(attempted || touched.confirm) ? confirmationError(confirm, password, attempted) : undefined} onBlur={() => setTouched((t) => ({ ...t, confirm: !!confirm }))} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" />
      <PrimaryButton disabled={isPending || !token}>{isPending ? 'Resetting…' : 'Reset password'}</PrimaryButton>
    </form>
    <p className={styles.secondary}><Link href="/login" className={styles.link}>Back to sign in</Link></p>
  </AuthShell>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><ResetPasswordForm /></Suspense>;
}
