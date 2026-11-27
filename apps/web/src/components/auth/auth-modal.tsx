'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { validateReturnTo } from '@/lib/validate-return-to';
import { AuthLayout } from './auth-layout';
import { CloseIcon } from '@/assets/icons';
import styles from './auth-modal.module.css';

const AUTH_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']);
const STORAGE_KEY = 'shopnest.auth.previous-page';
const AuthModalContext = createContext<{ returnTo: string } | null>(null);
export const useAuthModal = () => useContext(AuthModalContext);

export function AuthPageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!AUTH_PATHS.has(pathname)) {
      sessionStorage.setItem(STORAGE_KEY, pathname + window.location.search);
    }
  }, [pathname]);
  useEffect(() => {
    const rememberOrigin = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || AUTH_PATHS.has(window.location.pathname)) return;
      const link = target.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || !AUTH_PATHS.has(link.pathname)) return;
      sessionStorage.setItem(STORAGE_KEY, window.location.pathname + window.location.search);
    };
    document.addEventListener('click', rememberOrigin, true);
    return () => document.removeEventListener('click', rememberOrigin, true);
  }, []);
  return null;
}

export function AuthModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [returnTo, setReturnTo] = useState('/shop');

  useEffect(() => {
    const previous = validateReturnTo(sessionStorage.getItem(STORAGE_KEY));
    setReturnTo(previous === '/' ? '/shop' : previous);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const heading = dialog.current?.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => router.replace(returnTo), reducedMotion ? 0 : 220);
  }, [closing, returnTo, router]);

  return <AuthModalContext.Provider value={{ returnTo }}>
    <dialog ref={dialog} className={styles.dialog} data-closing={closing || undefined} aria-label="ShopNest account" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.surface}>
        <button type="button" className={styles.close} onClick={close} aria-label="Close sign in" autoFocus><CloseIcon className={styles.closeIcon} /></button>
        <AuthLayout showHeader={false}>{children}</AuthLayout>
      </div>
    </dialog>
  </AuthModalContext.Provider>;
}
