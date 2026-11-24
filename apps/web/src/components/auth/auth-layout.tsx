import { AuthShowcase } from './auth-showcase';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './auth.module.css';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className={styles.page}>
    <header className={styles.authHeader}>
      <nav aria-label="ShopNest">
        <Link href="/shop" className={styles.authWordmark} aria-label="ShopNest home">
          Shop<span>Nest</span>
        </Link>
      </nav>
    </header>
    <div className={`${styles.shell} ${styles.loginShell}`}>
      <section className={`${styles.panel} ${styles.loginPanel}`}>{children}</section>
      <AuthShowcase />
    </div>
  </main>;
}
