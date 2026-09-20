'use client';

import Link from 'next/link';

import { ChevronDownIcon, PackageIcon, SignOutIcon, UserIcon } from '@/assets/icons';

import type { UserIdentity } from '@/store/user.store';

import { FOCUS_RING } from './styles';
import { usePopover } from './use-popover';
import { usePresence } from './use-presence';
import { AccountContent } from './account-content';
import { MobileBottomSheet } from '@/components/shared/mobile-bottom-sheat';

type AccountMenuProps = {
  currentUser: UserIdentity | null;
  onSignOut: () => void;
};

export function AccountMenu({ currentUser, onSignOut }: AccountMenuProps) {
  const popover = usePopover<HTMLDivElement, HTMLButtonElement>();
  const desktopPresence = usePresence(popover.open, 160);

  if (!currentUser) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={`
          flex h-[38px] shrink-0 items-center gap-[7px]
          rounded-[6px] px-2
           text-black
          transition-colors duration-200
          hover:opacity-80
          ${FOCUS_RING}
        `}
      >
        <UserIcon className="h-5 w-5 shrink-0" />
        <span className="hidden text-[15px] font-normal leading-[18px] lg:block ">Login</span>
      </Link>
    );
  }

  return (
    <div ref={popover.rootRef} className="relative shrink-0">
      {/* Account trigger */}
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        className={`
          flex h-[46px] items-center gap-[8px]
          rounded-[6px] px-2.5
          text-black
          transition-colors duration-200
          cursor-pointer


          ${FOCUS_RING}
        `}
      >
        <UserIcon className="h-5 w-5 shrink-0" />

        <div className="hidden min-w-0 text-left lg:block">
          <span
            className="
              block
              text-[10px] font-normal leading-[14px]
              text-black/40
            "
          >
            Welcome back
          </span>

          <span
            className="
              block max-w-[135px] truncate
              text-[12px] font-medium leading-[18px]
              text-black
            "
          >
            {currentUser.email} 
          </span>
        </div>

        <ChevronDownIcon
          className={`
            hidden h-3 w-3 shrink-0
            text-black/45
            transition-transform duration-200
            lg:block

            ${popover.open ? 'rotate-180' : ''}
          `}
        />
      </button>

      {/* Desktop */}
      {desktopPresence.mounted && (
        <div
          role="menu"
          aria-label="Account"
          className={`
            absolute right-0 top-[calc(100%+8px)]
            z-50
            hidden w-[280px]
            origin-top-right
            overflow-hidden
            rounded-[6px]
            border border-black/[0.08]
            bg-white
            shadow-[0_8px_28px_rgba(0,0,0,0.08)]
            transition-[opacity,transform]
            duration-150
            ease-smooth
            lg:block

            ${
              desktopPresence.entered
                ? 'translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0'
            }
          `}
        >
          <AccountContent
            currentUser={currentUser}
            onClose={popover.close}
            onSignOut={onSignOut}
          />
        </div>
      )}

      {/* Mobile — always mounted so its own open/close transition can play */}
      <MobileBottomSheet open={popover.open} onClose={popover.close} title="Account">
        <AccountContent
          currentUser={currentUser}
          onClose={popover.close}
          onSignOut={onSignOut}
          mobile
        />
      </MobileBottomSheet>
    </div>
  );
}
