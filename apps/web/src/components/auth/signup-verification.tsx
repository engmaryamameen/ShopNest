'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUserStore } from '@/store/user.store';
import { validateReturnTo } from '@/lib/validate-return-to';
import { AuthShell } from './auth-shell';
import { PrimaryButton } from './auth-fields';
import styles from './auth.module.css';

export function SignupVerification() {
  const router = useRouter();
  const setUser = useUserStore((state) => state.setUser);
  const [email, setEmail] = useState('');
  const [returnTo, setReturnTo] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setEmail(sessionStorage.getItem('shopnest.signup.email') ?? '');
    setReturnTo(sessionStorage.getItem('shopnest.signup.returnTo') ?? '');
  }, []);

  function enterDigits(index: number, value: string) {
    const numbers = value.replace(/\D/g, '').slice(0, 6 - index);
    setDigits((current) => {
      const next = [...current];
      if (!numbers) next[index] = '';
      else [...numbers].forEach((digit, offset) => { next[index + offset] = digit; });
      return next;
    });
    setError('');
    if (numbers) inputs.current[Math.min(index + numbers.length, 5)]?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (digits.some((digit) => !digit)) { setError('Please enter the six-digit code.'); inputs.current[digits.findIndex((digit) => !digit)]?.focus(); return; }
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const { user } = await api.verifySignup(digits.join(''));
        setUser({ id: user.id, email: user.email, role: user.role, emailVerifiedAt: user.emailVerifiedAt });
        const destination = validateReturnTo(sessionStorage.getItem('shopnest.signup.returnTo'));
        sessionStorage.removeItem('shopnest.signup.email'); sessionStorage.removeItem('shopnest.signup.name'); sessionStorage.removeItem('shopnest.signup.returnTo');
        router.push(destination === '/' ? '/shop' : destination); router.refresh();
      } catch (err) { setError(err instanceof ApiError && err.status < 500 ? err.message : 'We could not verify your code. Please try again.'); }
    });
  }

  function resend() {
    setError(''); setNotice('');
    startTransition(async () => {
      try { await api.resendSignup(); setDigits(Array(6).fill('')); setNotice('A new code has been sent.'); inputs.current[0]?.focus(); }
      catch (err) { setError(err instanceof ApiError && err.status < 500 ? err.message : 'We could not send a new code. Please try again.'); }
    });
  }

  const editParams = new URLSearchParams({ edit: 'email' });
  if (returnTo && returnTo !== '/') editParams.set('returnTo', returnTo);

  return <AuthShell title="Please verify your email address" description={<>We’ve sent an email to <span className={styles.verificationEmail}>{email || 'your email address'}</span>, please enter the code below. <Link className={styles.editEmail} href={`/register?${editParams}`} aria-label="Edit email address">Edit email</Link></>}>
    <form onSubmit={submit} className={`${styles.form} ${styles.loginForm}`} noValidate>
      <fieldset className={styles.codeField} aria-describedby={error ? 'signup-code-error' : undefined}>
        <legend>Enter code</legend>
        <div className={styles.codeInputs}>
          {digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} value={digit} onChange={(event) => enterDigits(index, event.target.value)} onPaste={(event) => { event.preventDefault(); enterDigits(index, event.clipboardData.getData('text')); }} onKeyDown={(event) => { if (event.key === 'Backspace' && !digit && index > 0) inputs.current[index - 1]?.focus(); }} aria-label={`Digit ${index + 1} of 6`} aria-invalid={!!error} autoComplete={index === 0 ? 'one-time-code' : 'off'} inputMode="numeric" pattern="[0-9]*" />)}
        </div>
      </fieldset>
      {error && <p id="signup-code-error" className={styles.fieldError} role="alert">{error}</p>}
      {notice && <p className={styles.hint} role="status">{notice}</p>}
      <PrimaryButton disabled={pending}>{pending ? 'Please wait…' : 'Create account'}</PrimaryButton>
    </form>
    <p className={styles.secondary}>Didn’t receive the email? <button className={styles.resendCode} type="button" onClick={resend} disabled={pending}>Resend code</button></p>
  </AuthShell>;
}
