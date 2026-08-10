'use client';

import Link from 'next/link';
import { ChevronDownIcon, PackageIcon, SignOutIcon, UserIcon } from '@/assets/icons';
import { usePopover } from './use-popover';
import { FOCUS_RING } from './styles';
import type { UserIdentity } from '@/store/user.store';

/**
 * Signed-out visitors get a plain link straight to /login (there's nothing
 * to expose in a menu yet). Signed-in users get a small popover so "your
 * orders" and "sign out" are reachable at every viewport — previously
 * sign-out only appeared above the xl breakpoint.
 */
export function AccountMenu({ currentUser, onSignOut }: { currentUser: UserIdentity | null; onSignOut: () => void }) {
  const popover = usePopover<HTMLDivElement, HTMLButtonElement>();

  if (!currentUser) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={`flex items-center gap-2 rounded-xl p-2.5 text-zinc-700 transition-colors hover:bg-zinc-100 lg:px-3 ${FOCUS_RING}`}
      >
        <UserIcon className="h-[22px] w-[22px]" />
        <span className="hidden text-left lg:block">
          <span className="block text-[10px] font-medium text-zinc-400">Hello, sign in</span>
          <span className="block text-xs font-bold text-zinc-800">Account</span>
        </span>
      </Link>
    );
  }

  return (
    <div ref={popover.rootRef} className="relative">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        className={`flex items-center gap-1.5 rounded-xl p-2.5 text-zinc-700 transition-colors hover:bg-zinc-100 lg:px-3 ${FOCUS_RING}`}
      >
        <UserIcon className="h-[22px] w-[22px]" />
        <span className="hidden text-left lg:block">
          <span className="block text-[10px] font-medium text-zinc-400">Welcome back</span>
          <span className="block max-w-28 truncate text-xs font-bold text-zinc-800">{currentUser.email}</span>
        </span>
        <ChevronDownIcon
          className={`hidden h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-150 lg:block ${popover.open ? 'rotate-180' : ''}`}
        />
      </button>

      {popover.open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-950/10"
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-[11px] font-medium text-zinc-400">Signed in as</p>
            <p className="truncate text-sm font-semibold text-zinc-900">{currentUser.email}</p>
          </div>
          <Link
            href="/orders"
            role="menuitem"
            onClick={popover.close}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-brand-50 hover:text-brand-800 ${FOCUS_RING}`}
          >
            <PackageIcon className="h-4 w-4 text-zinc-400" />
            Your orders
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              popover.close();
              onSignOut();
            }}
            className={`flex w-full items-center gap-2.5 border-t border-zinc-100 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 ${FOCUS_RING}`}
          >
            <SignOutIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
