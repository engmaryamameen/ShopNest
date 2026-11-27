'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { useAuthModal } from '@/components/auth/auth-modal';
import { AuthField, PasswordField, Feedback, PrimaryButton } from '@/components/auth/auth-fields';
import { passwordError, confirmationError } from '@/components/auth/password-validation';
import Link from 'next/link';
import styles from '@/components/auth/auth.module.css';
import { ToastMessage } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { validateReturnTo } from '@/lib/validate-return-to';

/** Inner form — isolated so useSearchParams() gets its own Suspense boundary. */
function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const modal = useAuthModal();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (params.get('edit') !== 'email') return;
    setFullName(sessionStorage.getItem('shopnest.signup.name') ?? '');
    setEmail(sessionStorage.getItem('shopnest.signup.email') ?? '');
    document.getElementById('email')?.focus();
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    setAttempted(true);
    if (fullName.trim().length < 2 || fullName.trim().length > 100) { document.getElementById('fullName')?.focus(); return; }
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    if (!emailInput?.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput?.focus(); return; }
    if (passwordError(password, true)) { document.getElementById('password')?.focus(); return; }
    if (confirmationError(confirm, password, true)) { document.getElementById('confirm')?.focus(); return; }

    startTransition(async () => {
      try {
        await api.register({ fullName: fullName.trim(), email, password });
        sessionStorage.setItem('shopnest.signup.email', email);
        sessionStorage.setItem('shopnest.signup.name', fullName.trim());
        sessionStorage.setItem('shopnest.signup.returnTo', validateReturnTo(params.get('returnTo') ?? modal?.returnTo));
        router.push('/verify-email?signup=1');
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.status >= 500 ? 'We could not create your account right now. Please try again.' : err.message);
        } else {
          setError('We could not create your account right now. Please try again.');
        }
      }
    });
  }

  const query = params.get('returnTo') ? `?returnTo=${encodeURIComponent(params.get('returnTo')!)}` : '';
  return <AuthShell title="Join today" description="Create an account to keep track of your orders.">
    <GoogleSignIn returnTo={params.get('returnTo') ?? modal?.returnTo} />
    <form onSubmit={handleSubmit} className={`${styles.form} ${styles.loginForm}`} noValidate>
      {params.get('edit') === 'email' && <p className={styles.hint}>Update your email and enter your password again to receive a new code.</p>}
      {error && <ToastMessage message={error} />}
      <AuthField id="fullName" label="Full name" autoComplete="name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" error={attempted && fullName.trim().length < 2 ? "Please enter your full name." : undefined} />
      <AuthField error={attempted && !email ? "Please enter your email address." : attempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Please enter a valid email address." : undefined} id="email" label="Email address" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" />
      <PasswordField id="password" label="Password" error={passwordError(password, attempted) && (attempted || touched.password) ? passwordError(password, attempted) : undefined} onBlur={() => setTouched((t) => ({ ...t, password: !!password }))} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
      <PasswordField id="confirm" label="Confirm password" error={(attempted || touched.confirm) ? confirmationError(confirm, password, attempted) : undefined} onBlur={() => setTouched((t) => ({ ...t, confirm: !!confirm }))} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" />
      <PrimaryButton disabled={isPending}>{isPending ? 'Sending code…' : 'Continue'}</PrimaryButton>
    </form>
    <p className={styles.secondary}>Already have an account? <Link className={styles.Link} href={`/login${query}`}>Sign in</Link></p>
  </AuthShell>;
}

export default function RegisterPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><RegisterForm /></Suspense>;
}
