'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './auth.module.css';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: ReactNode; trailing?: ReactNode; error?: string };
export function AuthField({ id, label, hint, trailing, error, ...props }: FieldProps) {
  return <div className={styles.field}>
    <div className={styles.labelRow}><label htmlFor={id}>{label}</label>{trailing}</div>
    {hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
    <input {...props} id={id} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} />
    {error && <span id={`${id}-error`} className={styles.fieldError}><span className={styles.infoIcon} aria-hidden="true" />{error}</span>}
  </div>;
}
export function PasswordField({ id, label, hint, trailing, error, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}>
    <div className={styles.labelRow}><label htmlFor={id}>{label}</label>{trailing}</div>
    {hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
    <div className={styles.passwordControl}>
      <input {...props} id={id} type={visible ? 'text' : 'password'} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} />
      <button className={styles.toggle} type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}><span aria-hidden="true" className={visible ? styles.eyeOffIcon : styles.eyeIcon} /></button>
    </div>
    {error && <span id={`${id}-error`} className={styles.fieldError}><span className={styles.infoIcon} aria-hidden="true" />{error}</span>}
  </div>;
}
export function Feedback({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return <div className={kind === 'error' ? styles.error : styles.success} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return <button type="submit" className={styles.action} disabled={disabled}>{children}</button>;
}
