'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthField, Feedback, PrimaryButton } from '@/components/auth/auth-fields';
import styles from '@/components/auth/auth.module.css';
import { ToastMessage } from '@/components/ui/toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    startTransition(async () => {
      try { await api.forgotPassword({ email }); setSubmitted(true); }
      catch { setError(true); }
    });
  }
  return <AuthShell title="Forgot your password?" description="Enter the email address registered with your account. We'll send you a link to reset your password.">
    {submitted ? <Feedback kind="success">If an account exists for this email address, you’ll receive a password reset link.</Feedback> :
      <form onSubmit={handleSubmit} className={`${styles.form} ${styles.loginForm}`}>
        {error && <ToastMessage message="We couldn’t send your request. Please try again." />}
        <AuthField id="email" label="Email address" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" />
        <PrimaryButton disabled={isPending}>{isPending ? 'Sending…' : 'Send reset link'}</PrimaryButton>
      </form>}
    <p className={`${styles.secondary} ${styles.recoveryPrompt}`}>Remembered password? <Link href="/login" className={styles.Link} >Login to your account</Link></p>
  </AuthShell>;
}
