'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps an element mounted for `exitMs` after `open` goes false, so a CSS
 * exit transition can play instead of the element disappearing instantly.
 *
 * `mounted` gates whether to render the element at all; `entered` gates the
 * "settled" visual state (applied a frame after mount, so the browser has a
 * from-state to transition out of). Consumers typically do:
 *
 *   if (!mounted) return null;
 *   <div data-state={entered ? 'open' : 'closed'} className="… transition …" />
 */
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, entered };
}
