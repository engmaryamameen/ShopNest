'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { useAuthModal } from '@/components/auth/auth-modal';
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
  const modal = useAuthModal();
  const setUser = useUserStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [linkConfirmed, setLinkConfirmed] = useState(false);

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
        const returnTo = params.get('google') === 'link'
          ? validateReturnTo((await api.linkGoogle()).returnTo)
          : validateReturnTo(params.get('returnTo') ?? modal?.returnTo);
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

  function confirmLink() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await api.confirmGoogleLink();
        if (result.status === 'requires_signin') { setLinkConfirmed(true); return; }
        router.push(validateReturnTo(result.returnTo));
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError && err.status < 500 ? err.message : 'We could not link your accounts. Please try again.');
      }
    });
  }

  if (params.get('google') === 'link' && !linkConfirmed) {
    return <AuthShell title="Link your accounts?" description="A ShopNest account already exists for this email. Would you like to link it to Google?">
      <div className={styles.linkConfirmation}>
        <p className={styles.linkNotice}>If your ShopNest email is not verified, we’ll sign out other devices and you’ll need to reset your password.</p>
        {error && <Feedback kind="error">{error}</Feedback>}
        <button type="button" className={styles.linkConfirmButton} onClick={confirmLink} disabled={isPending}>{isPending ? 'Linking…' : 'Yes, link accounts'}</button>
        <Link href="/login" className={styles.linkDecline}>Not now</Link>
      </div>
    </AuthShell>;
  }

  return <AuthShell mode="login" returnTo={params.get('returnTo')}>
    <GoogleSignIn returnTo={params.get('returnTo') ?? modal?.returnTo} />
    <form onSubmit={handleSubmit} className={`${styles.form} ${styles.loginForm}`} noValidate>
      {params.get('reset') === 'success' && <Feedback kind="success">Password reset. Sign in with your new password.</Feedback>}
      {params.get('google') === 'link' && <Feedback kind="success">An account already exists for this email. Sign in below to link your Google account.</Feedback>}
      {params.get('google') && params.get('google') !== 'link' && <Feedback kind="error">{params.get('google') === 'existing_account' ? 'An account already exists for this email. Please sign in using your existing method.' : params.get('google') === 'unavailable' ? 'Google sign-in is currently unavailable. Please use email and password.' : 'Google sign-in could not be completed. Please try again.'}</Feedback>}
      {error && <ToastMessage message={error} />}
      <AuthField id="email" name="email" error={attempted ? (!email ? "Please enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Please enter a valid email address." : undefined) : undefined} label="Email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" />
      <PasswordField id="password" name="password" error={attempted && !password ? "Please enter your password." : undefined} label="Password" trailing={<Link className={`${styles.link} ${styles.Link}`} href="/forgot-password">Forgot password?</Link>} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
      <PrimaryButton disabled={isPending}>{isPending ? 'Signing in…' : params.get('google') === 'link' ? 'Sign in and link Google' : 'Sign in'}</PrimaryButton>
    </form>
    {params.get('google') === 'link' && <p className={styles.secondary}><Link href="/login" className={styles.Link}>Not now</Link></p>}
    <p className={styles.secondary}>New to ShopNest? <Link href={`/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`} className={styles.Link}>Create an account</Link></p>
  </AuthShell>;
}

export default function LoginPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><LoginForm /></Suspense>;
}
