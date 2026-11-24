'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './toast.module.css';

type Toast = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const showToast = useCallback((message: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return <ToastContext.Provider value={showToast}>
    {children}
    <div className={styles.region} aria-live="assertive" aria-atomic="true">
      {toast && <div className={styles.toast} key={toast.id}>
        <span className={styles.icon} aria-hidden="true">!</span>
        <div><strong>Unable to complete request</strong><p>{toast.message}</p></div>
        <span className={styles.progress} aria-hidden="true" />
      </div>}
    </div>
  </ToastContext.Provider>;
}

export function ToastMessage({ message }: { message: string }) {
  const showToast = useContext(ToastContext);
  useEffect(() => { showToast(message); }, [message, showToast]);
  return null;
}
