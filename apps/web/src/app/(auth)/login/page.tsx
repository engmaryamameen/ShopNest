'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthField, PasswordField, Feedback, PrimaryButton } from '@/components/auth/auth-fields';
import styles from '@/components/auth/auth.module.css';
import { ToastMessage } from '@/components/ui/toast';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUserStore } from '@/store/user.store';
import { validateReturnTo } from '@/lib/validate-return-to';

/** Inner form — isolated so useSearchParams() gets its own Suspense boundary. */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useUserStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAttempted(true);
    const emailInput = e.currentTarget.elements.namedItem('email') as HTMLInputElement;
    const passwordInput = e.currentTarget.elements.namedItem('password') as HTMLInputElement;
    const currentEmail = emailInput.value;
    const currentPassword = passwordInput.value;
    setEmail(currentEmail);
    setPassword(currentPassword);
    if (!emailInput.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail)) { emailInput.focus(); return; }
    if (!currentPassword) { passwordInput.focus(); return; }
    startTransition(async () => {
      try {
        const result = await api.login({ email: currentEmail, password: currentPassword });
        setUser({
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          emailVerifiedAt: result.user.emailVerifiedAt,
        });
        const returnTo = validateReturnTo(params.get('returnTo'));
        router.push(returnTo);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.status >= 500 ? 'We could not sign you in right now. Please try again.' : err.message);
        } else {
          setError('We could not sign you in right now. Please try again.');
        }
      }
    });
  }

  return <AuthShell mode="login" returnTo={params.get('returnTo')}>
    <form onSubmit={handleSubmit} className={`${styles.form} ${styles.loginForm}`} noValidate>
      {params.get('reset') === 'success' && <Feedback kind="success">Password reset. Sign in with your new password.</Feedback>}
      {error && <ToastMessage message={error} />}
      <AuthField id="email" name="email" error={attempted ? (!email ? "Please enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Please enter a valid email address." : undefined) : undefined} label="Email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" />
      <PasswordField id="password" name="password" error={attempted && !password ? "Please enter your password." : undefined} label="Password" trailing={<Link className={`${styles.link} ${styles.Link}`} href="/forgot-password">Forgot password?</Link>} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
      <PrimaryButton disabled={isPending}>{isPending ? 'Signing in…' : 'Sign in'}</PrimaryButton>
    </form>
    <p className={styles.secondary}>New to ShopNest? <Link href={`/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`} className={styles.Link}>Create an account</Link></p>
  </AuthShell>;
}

export default function LoginPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><LoginForm /></Suspense>;
}
