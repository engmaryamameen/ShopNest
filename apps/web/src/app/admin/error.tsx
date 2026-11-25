'use client';

import styles from './state.module.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isDashboard = usePathname() === '/admin';
  return (
    <section className={styles.state} role="alert">
      <h2>{isDashboard ? "Couldn’t load the dashboard" : "Couldn’t load this page"}</h2>
      <p>Something went wrong while loading this {isDashboard ? "dashboard" : "page"}. Try again. If the problem continues, <a href="mailto:maryamshehzadi768@gmail.com?subject=ShopNest%20admin%20support">contact the administrator</a>.</p>
      <div className={styles.actions}>
        <button type="button" onClick={reset}>Try again</button>
        {!isDashboard && <Link href="/admin">Return to dashboard</Link>}
      </div>
    </section>
  );
}
