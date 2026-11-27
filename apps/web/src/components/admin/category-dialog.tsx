'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { calendarDialogStyle } from '@/components/ui/calendar-month';
import drawerStyles from './product-details-drawer.module.css';

export const categoryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce2e8] bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

export function CategoryDialog({ title, subtitle, children, footer, onClose, busy = false, closing = false, panel = false }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
  onClose: () => void; busy?: boolean; closing?: boolean; panel?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [requestedClose, setRequestedClose] = useState(false);
  const leaving = closing || requestedClose;
  useEffect(() => {
    dialog.current?.showModal();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dialog.current?.close(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  function requestClose() {
    if (busy) return;
    // Panels let their owner check for unsaved changes before closing.
    if (panel) onClose();
    else setRequestedClose(true);
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      data-closing={leaving || undefined}
      onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); requestClose(); }}
      onClose={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
      onAnimationEnd={(event) => { if (leaving && event.target === event.currentTarget) dialog.current?.close(); }}
      className={panel ? `${drawerStyles.drawer} fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none border-0 bg-white p-0 shadow-xl` : `${calendarDialogStyle} max-w-[440px] p-0`}
    >
      <div className={panel ? 'flex min-h-full flex-col' : ''}>
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-[#e5e9ee] bg-white px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500 break-words">{subtitle}</p>}
          </div>
          <button type="button" disabled={busy} aria-label={`Close ${panel ? 'category editor' : 'dialog'}`} onClick={requestClose} className="grid size-8 shrink-0 place-items-center rounded-md text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:opacity-40">×</button>
        </header>
        {children}
        {footer && <footer className="sticky bottom-0 mt-auto flex justify-end gap-3 border-t border-[#e5e9ee] bg-white px-6 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}
