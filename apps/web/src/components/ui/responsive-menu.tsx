'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MobileBottomSheet } from '@/components/shared/mobile-bottom-sheat';

export function ResponsiveMenu({
  label,
  trigger,
  children,
  className = '',
  portal = false,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  /** Escape a table's scroll container without clipping row actions. */
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useLayoutEffect(() => {
    if (!open || mobile || !portal) return;
    const place = () => {
      if (!button.current || !menu.current) return;
      const anchor = button.current.getBoundingClientRect();
      const bounds = menu.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchor.bottom - 12;
      const above = spaceBelow < bounds.height && anchor.top > spaceBelow;
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12),
        ),
        top: above ? Math.max(12, anchor.top - bounds.height - 6) : anchor.bottom + 6,
        maxHeight: Math.max(80, above ? anchor.top - 18 : spaceBelow),
        visibility: 'visible',
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, mobile, portal]);
  useEffect(() => {
    if (!open || mobile) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !container.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open, mobile]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const desktopMenu =
    open && !mobile ? (
      <div
        ref={menu}
        id={id}
        style={portal ? position : undefined}
        className={`${portal ? 'fixed z-50 overflow-y-auto' : 'absolute right-0 z-40 mt-1'} min-w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg`}
      >
        {children(close)}
      </div>
    ) : null;
  return (
    <div ref={container} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open && !mobile ? id : undefined}
        aria-haspopup={mobile ? 'dialog' : 'true'}
        onClick={() => setOpen(!open)}
        className="w-full"
      >
        {trigger}
      </button>
      {mobile ? (
        <MobileBottomSheet open={open} onClose={close} title={label}>
          <div className="p-4">{children(close)}</div>
        </MobileBottomSheet>
      ) : portal && desktopMenu ? (
        createPortal(desktopMenu, document.body)
      ) : (
        desktopMenu
      )}
    </div>
  );
}
