import type { ReactNode } from 'react';

export type NotificationType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'critical'
  | 'loading'
  | 'pending'
  | 'offline';

const iconColors: Record<NotificationType, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-[var(--danger)] dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-[var(--shopnest-action)] dark:text-sky-400',
  critical: 'text-rose-700 dark:text-rose-400',
  loading: 'text-admin-muted dark:text-slate-400',
  pending: 'text-violet-600 dark:text-violet-400',
  offline: 'text-admin-muted dark:text-slate-400',
};

const iconPaths: Record<NotificationType, ReactNode> = {
  success: (
    <>
      <path d="M20.5 11.5v.5a8.5 8.5 0 1 1-5.1-7.8" />
      <path d="m8 11.5 3.2 3.2L21 5" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.5a1.95 1.95 0 0 1 3.4 0l7 12.3a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3Z" />
      <path d="M12 9v4.4" />
      <circle cx="12" cy="16.7" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.8 11H12v5h1.2" />
      <circle cx="12" cy="7.6" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  critical: (
    <>
      <path d="M9 3.2h6l5.8 5.8v6L15 20.8H9L3.2 15V9Z" />
      <path d="M12 7.2v6" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  loading: (
    <>
      <circle cx="12" cy="12" r="9" opacity=".15" />
      <path d="M12 3a9 9 0 0 1 9 9" />
      <path d="M21 12a9 9 0 0 1-2.6 6.4" opacity=".5" />
    </>
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.5 2.2" />
    </>
  ),
  offline: (
    <>
      <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 3-1.7m5.5.1a10 10 0 0 1 3.5 1.6M9 16a5 5 0 0 1 6 0M3 3l18 18" />
      <circle cx="12" cy="20" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
};

export function NotificationIcon({ type }: { type: NotificationType }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-notification-icon={type}
      className={[
        'block h-9 w-9 shrink-0 self-center',
        iconColors[type],
        type === 'loading' ? 'motion-safe:animate-spin' : '',
      ].join(' ')}
    >
      {iconPaths[type]}
    </svg>
  );
}
