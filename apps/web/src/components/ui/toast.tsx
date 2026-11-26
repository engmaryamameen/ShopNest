'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { NotificationIcon } from './notification-icon';

type Toast = {
  id: string;
  message: string;
  container: HTMLDialogElement | null;
  title: string;
  tone: 'error' | 'success' | 'info';
  duration: number | null;
  progress?: number;
  action?: { label: string; href: string };
};
const ToastContext = createContext<{
  show: (toast: Toast) => void;
  dismiss: (id: string, manual?: boolean) => void;
}>({ show: () => {}, dismiss: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = useRef<Toast | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const dismissedOperation = useRef<string | null>(null);
  const remaining = useRef<number | null>(null);
  const paused = hovered || focused;

  const show = useCallback((next: Toast) => {
    if (next.duration === null && dismissedOperation.current === next.id) return;
    const active = document.activeElement;
    if (
      current.current?.id !== next.id &&
      active instanceof HTMLElement &&
      !element.current?.contains(active)
    )
      origin.current = active;
    current.current = next;
    setLeaving(false);
    setToast(next);
  }, []);

  const remove = useCallback((id: string) => {
    if (current.current?.id !== id) return;
    current.current = null;
    setToast(null);
    setLeaving(false);
    setHovered(false);
    setFocused(false);
  }, []);
  const dismiss = useCallback((id: string, manual = true) => {
    if (current.current?.id !== id) return;
    if (manual && current.current.duration === null) dismissedOperation.current = id;
    if (manual && element.current?.contains(document.activeElement))
      origin.current?.focus({ preventScroll: true });
    setLeaving(true);
  }, []);

  useEffect(() => {
    remaining.current = toast?.duration ?? null;
  }, [toast]);
  useEffect(() => {
    if (!toast || toast.duration === null || leaving || paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current ?? toast.duration);
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null)
        remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [toast, leaving, paused, dismiss]);
  useEffect(() => {
    if (!toast || !leaving) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => remove(toast.id), reducedMotion ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [toast, leaving, remove]);

  const region = toast && (
    <div className="pointer-events-none fixed top-[max(12px,env(safe-area-inset-top))] left-1/2 z-[1000] w-max min-w-[min(440px,calc(100%_-_32px))] max-w-[min(880px,calc(100%_-_32px))] -translate-x-1/2 sm:top-[max(20px,env(safe-area-inset-top))]">
      <div
        ref={element}
        className={[
          'pointer-events-auto relative grid grid-cols-[36px_minmax(0,1fr)_28px] items-center gap-x-4 gap-y-2 overflow-hidden rounded-[14px] border border-[#e1e7ec] bg-white px-4 pt-4 pb-[19px] text-[#172126] shadow-[0_16px_48px_rgb(15_23_42/16%),0_3px_8px_rgb(15_23_42/5%)] transition-[translate,opacity] ease-smooth motion-reduce:transition-none sm:flex [@media(pointer:coarse)]:grid-cols-[36px_minmax(0,1fr)_36px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
          leaving
            ? 'pointer-events-none translate-x-[100vw] opacity-0 duration-[220ms]'
            : 'translate-x-0 opacity-100 duration-[320ms] starting:-translate-x-[100vw] starting:opacity-0',
        ].join(' ')}
        data-state={leaving ? 'leaving' : 'visible'}
        data-paused={paused}
        key={toast.id}
        role={toast.tone === 'error' ? 'alert' : 'status'}
        aria-atomic="true"
        aria-hidden={leaving || undefined}
        inert={leaving}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={(event) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            event.relatedTarget.isConnected &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            origin.current = event.relatedTarget;
          setFocused(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        onTransitionEnd={(event) => {
          if (
            leaving &&
            event.target === event.currentTarget &&
            (event.propertyName === 'translate' || event.propertyName === 'transform')
          )
            remove(toast.id);
        }}
      >
        <NotificationIcon
          type={toast.tone === 'info' && toast.duration === null ? 'loading' : toast.tone}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="block text-[15px] leading-[21px] font-semibold">{toast.title}</strong>
          <p className="m-0 text-sm leading-5 wrap-anywhere text-[#596574] dark:text-slate-300">
            {toast.message}
          </p>
        </div>
        {toast.action && (
          <a
            className="col-start-2 row-start-2 w-fit shrink-0 text-[13px] leading-5 font-semibold whitespace-nowrap text-[var(--shopnest-action)] no-underline underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--shopnest-action)] sm:ml-2 dark:text-sky-400"
            href={toast.action.href}
          >
            {toast.action.label}
          </a>
        )}
        <button
          type="button"
          className="col-start-3 row-start-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-xl leading-none text-[#7e8996] transition-colors duration-150 hover:bg-[#f0f3f6] hover:text-[#172126] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--shopnest-action)] motion-reduce:transition-none [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label="Dismiss notification"
          onClick={() => dismiss(toast.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
        {(toast.progress !== undefined || toast.duration !== null) && (
          <ToastProgress
            key={`${toast.id}:${toast.title}:${toast.duration}`}
            progress={toast.progress}
            duration={toast.duration}
            paused={paused || leaving}
            tone={toast.tone}
          />
        )}
      </div>
    </div>
  );
  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {toast?.container?.open ? createPortal(region, toast.container) : region}
    </ToastContext.Provider>
  );
}

function ToastProgress({
  progress,
  duration,
  paused,
  tone,
}: Pick<Toast, 'progress' | 'duration' | 'tone'> & { paused: boolean }) {
  const elapsed = useRef(0);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (progress !== undefined || !duration || paused) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setValue(Math.min(1, (elapsed.current + Date.now() - started) / duration));
    }, 100);
    return () => {
      window.clearInterval(timer);
      elapsed.current += Date.now() - started;
    };
  }, [progress, duration, paused]);
  return (
    <progress
      aria-hidden="true"
      max={1}
      value={progress === undefined ? value : Math.max(0, Math.min(1, progress))}
      className={[
        'absolute inset-x-0 bottom-0 block h-[3px] w-full appearance-none overflow-hidden border-0 bg-[#edf1f4] [&::-webkit-progress-bar]:bg-[#edf1f4] [&::-webkit-progress-value]:bg-current [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-[220ms] motion-reduce:[&::-webkit-progress-value]:transition-none [&::-moz-progress-bar]:bg-current dark:bg-slate-800 dark:[&::-webkit-progress-bar]:bg-slate-800',
        tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : tone === 'error'
            ? 'text-[var(--danger)] dark:text-red-400'
            : 'text-[var(--shopnest-action)] dark:text-sky-400',
      ].join(' ')}
    />
  );
}

export function ToastMessage({
  message,
  title = 'Unable to complete request',
  tone = 'error',
  duration = 6000,
  progress,
  action,
}: {
  message: string;
  title?: string;
  tone?: Toast['tone'];
  duration?: number | null;
  progress?: number;
  action?: Toast['action'];
}) {
  const { show, dismiss } = useContext(ToastContext);
  const id = useId();
  const marker = useRef<HTMLSpanElement>(null);
  const actionLabel = action?.label;
  const actionHref = action?.href;
  useEffect(() => {
    show({
      id,
      message,
      container: marker.current?.closest('dialog[open]') ?? null,
      title,
      tone,
      duration,
      progress,
      action: actionLabel && actionHref ? { label: actionLabel, href: actionHref } : undefined,
    });
  }, [id, message, title, tone, duration, progress, actionLabel, actionHref, show]);
  useEffect(() => () => dismiss(id, false), [id, dismiss]);
  return <span ref={marker} hidden />;
}
