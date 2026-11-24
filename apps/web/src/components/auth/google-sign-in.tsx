import styles from './auth.module.css';

export function GoogleSignIn({ returnTo }: { returnTo?: string | null }) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  return <div className={styles.googleSection}>
    <a className={styles.googleButton} href={`/api/auth/google${query}`}>
      <span className={styles.googleIcon} aria-hidden="true" />
      <span className={styles.googleLabel}>Continue with Google</span>
    </a>
    <div className={styles.authDivider}><span>or continue with email</span></div>
  </div>;
}
