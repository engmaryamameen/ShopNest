'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { CloseIcon, GridIcon, PackageIcon, ShieldCheckIcon, TagIcon, TruckIcon } from '@/assets/icons';
import { BrandLogo } from './brand-logo';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useFocusTrap } from './use-focus-trap';
import { useEscapeKey } from './use-escape-key';
import { FOCUS_RING } from './styles';
import type { HeaderCategory } from './types';
import type { UserIdentity } from '@/store/user.store';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: HeaderCategory[];
  currentUser: UserIdentity | null;
  onSignOut: () => void;
}

/**
 * Slide-out navigation for viewports below `lg`. Stays mounted at all times
 * (visibility driven by transforms/opacity) so both the open and close
 * transitions animate smoothly; `inert` keeps it out of the tab order and
 * off-screen from assistive tech whenever it's closed.
 */
export function MobileDrawer({ open, onClose, categories, currentUser, onSignOut }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  useFocusTrap(open, panelRef);
  useEscapeKey(open, onClose);

  return (
    <div className="fixed inset-0 z-50 lg:hidden px-4 sm:px-6 lg:px-6" inert={!open}>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`absolute inset-0 bg-ink-900/55 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="ShopNest menu"
        className={`absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <BrandLogo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={`grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 ${FOCUS_RING}`}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {currentUser ? (
          <div className="shrink-0 border-b border-zinc-100 px-4 py-4">
            <p className="text-[11px] font-medium text-zinc-400">Welcome back</p>
            <p className="truncate text-sm font-bold text-zinc-900">{currentUser.email}</p>
            <div className="mt-3 flex gap-2">
              <Link
                href="/orders"
                onClick={onClose}
                className={`flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-center text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 ${FOCUS_RING}`}
              >
                Your orders
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className={`flex-1 rounded-lg border border-red-200 px-3 py-2 text-center text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 ${FOCUS_RING}`}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2 border-b border-zinc-100 px-4 py-4">
            <Link
              href="/login"
              onClick={onClose}
              className={`flex-1 rounded-lg bg-brand-600 px-3 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-brand-700 ${FOCUS_RING}`}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              onClick={onClose}
              className={`flex-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-center text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 ${FOCUS_RING}`}
            >
              Create account
            </Link>
          </div>
        )}

        <nav aria-label="Categories" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <Link
            href="/shop"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-zinc-900 transition-colors hover:bg-brand-50 hover:text-brand-700 ${FOCUS_RING}`}
          >
            <GridIcon className="h-5 w-5 text-brand-600" />
            All categories
          </Link>

          <p className="mt-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Popular categories</p>
          <ul>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/shop?category=${encodeURIComponent(category.slug)}`}
                  onClick={onClose}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 ${FOCUS_RING}`}
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/shop"
            onClick={onClose}
            className={`mt-2 flex items-center gap-2 rounded-full bg-accent-50 px-3.5 py-2.5 text-sm font-bold text-accent-700 transition-colors hover:bg-accent-100 ${FOCUS_RING}`}
          >
            <TagIcon className="h-4 w-4" />
            Today&apos;s deals
          </Link>
        </nav>

        <div className="shrink-0 border-t border-zinc-100 px-4 py-3.5">
          <Link
            href="/orders"
            onClick={onClose}
            className={`flex items-center gap-2 text-xs font-semibold text-zinc-600 transition-colors hover:text-brand-700 ${FOCUS_RING}`}
          >
            <PackageIcon className="h-4 w-4 text-brand-600" />
            Track your order
          </Link>
          <div className="mt-2.5 flex items-center gap-4 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              Secure payments
            </span>
            <span className="inline-flex items-center gap-1">
              <TruckIcon className="h-3.5 w-3.5" />
              Fast delivery
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
