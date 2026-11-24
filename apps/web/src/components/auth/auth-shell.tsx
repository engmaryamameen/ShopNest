import type { ReactNode } from 'react';
import styles from './auth.module.css';

type Props = { children: ReactNode; title?: string; description?: ReactNode; mode?: 'login' | 'register'; returnTo?: string | null };
export function AuthShell({ children, title, description, mode }: Props) {
  return <div className={`${styles.formWrap} ${styles.loginView}`}>
    <h1 className='font-extrabold text-7xl'>{title ?? (mode === 'login' ? 'Login' : 'account')}</h1>
    <p className={styles.intro}>{description ?? (mode === 'login' ? 'Welcome back! Sign in to pick up where you left off.' : 'Create an account to keep track of your orders.')}</p>
    {children}
  </div>;
}
