'use client';

import { useRef } from 'react';

import { CloseIcon } from '@/assets/icons';
import { FOCUS_RING } from '../shop/nav/styles';
import { useBodyScrollLock } from '../shop/nav/use-body-scroll-lock';
import { useEscapeKey } from '../shop/nav/use-escape-key';
import { useFocusTrap } from '../shop/nav/use-focus-trap';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function MobileBottomSheet({
  open,
  onClose,
  title,
  children,
  className = '',
}: MobileBottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);

  return (
    <div
      className={`
        fixed inset-0 z-[100]
        transition-visibility
        lg:hidden

        ${open ? 'visible' : 'invisible'}
      `}
      inert={!open}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`
          absolute inset-0
          h-full w-full
          bg-black/40
          transition-opacity duration-300

          ${open ? 'opacity-100' : 'opacity-0'}
        `}
      />

      {/* Sheet */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          absolute inset-x-0 bottom-0
          max-h-[85dvh]
          overflow-hidden
          rounded-t-[20px]
          bg-white
          shadow-[0_-16px_50px_rgba(0,0,0,0.14)]
          transition-transform
          duration-300
          ease-out

          ${
            open
              ? 'translate-y-0'
              : 'translate-y-full'
          }

          ${className}
        `}
      >
        {/* Drag indicator */}
        <div className="flex h-5 items-center justify-center">
          <div className="h-1 w-9 rounded-full bg-black/15" />
        </div>

        {title && (
          <div className="flex items-center justify-between border-b border-black/[0.07] px-5 pb-3 pt-1">
            <h2 className="text-[14px] font-semibold text-black">
              {title}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`
                grid h-8 w-8 place-items-center
                rounded-[6px]
                text-black/50
                transition-colors
                hover:bg-black/[0.04]
                hover:text-black

                ${FOCUS_RING}
              `}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="max-h-[calc(85dvh-64px)] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}