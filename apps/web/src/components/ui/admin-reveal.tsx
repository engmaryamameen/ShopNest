'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Animate natural content height while keeping collapsed controls inactive. */
export function AdminReveal({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  const [settledOpen, setSettledOpen] = useState(open);
  useEffect(() => {
    if (!open) {
      setSettledOpen(false);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      setSettledOpen(true);
      return;
    }
    // Fallback for transitions interrupted by a parent changing visibility.
    const timer = window.setTimeout(() => setSettledOpen(true), 250);
    const syncMotion = () => {
      if (reducedMotion.matches) setSettledOpen(true);
    };
    reducedMotion.addEventListener('change', syncMotion);
    return () => {
      window.clearTimeout(timer);
      reducedMotion.removeEventListener('change', syncMotion);
    };
  }, [open]);
  return (
    <div
      id={id}
      aria-hidden={!open}
      inert={!open}
      data-admin-reveal
      data-open={open}
      className={`grid transition-[grid-template-rows,opacity,visibility] duration-[220ms,160ms,0ms] ease-[cubic-bezier(0.2,0,0,1),ease,linear] motion-reduce:transition-none ${open ? 'visible grid-rows-[1fr] opacity-100 delay-[0ms,0ms,0ms]' : 'invisible grid-rows-[0fr] opacity-0 delay-[0ms,0ms,220ms] pointer-events-none'}`}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows')
          setSettledOpen(open);
      }}
    >
      <div
        className={`flow-root min-h-0 ${open && settledOpen ? 'overflow-visible' : 'overflow-hidden'}`}
      >
        {children}
      </div>
    </div>
  );
}
