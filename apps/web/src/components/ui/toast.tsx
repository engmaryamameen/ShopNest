'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './toast.module.css';

type Toast = { id: number; message: string; container: HTMLDialogElement | null };
const ToastContext = createContext<(message: string, container: HTMLDialogElement | null) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const showToast = useCallback((message: string, container: HTMLDialogElement | null) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, container });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const region = <div className={styles.region} aria-live="assertive" aria-atomic="true">
      {toast && <div className={styles.toast} key={toast.id}>
        <span className={styles.icon} aria-hidden="true">!</span>
        <div><strong>Unable to complete request</strong><p>{toast.message}</p></div>
        <span className={styles.progress} aria-hidden="true" />
      </div>}
    </div>;
  return <ToastContext.Provider value={showToast}>
    {children}
    {toast?.container?.open ? createPortal(region, toast.container) : region}
  </ToastContext.Provider>;
}

export function ToastMessage({ message }: { message: string }) {
  const showToast = useContext(ToastContext);
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => { showToast(message, marker.current?.closest('dialog[open]') ?? null); }, [message, showToast]);
  return <span ref={marker} hidden />;
}
