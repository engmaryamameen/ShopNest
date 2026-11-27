'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEscapeKey } from './use-escape-key';

/**
 * State + dismissal behavior shared by every header dropdown (category
 * scope, "all categories" mega menu, account menu): closes on outside
 * pointer-down, closes on Escape and returns focus to the trigger that
 * opened it.
 */
export function usePopover<TRoot extends HTMLElement = HTMLDivElement, TTrigger extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<TRoot>(null);
  const triggerRef = useRef<TTrigger>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEscapeKey(
    open,
    useCallback(() => {
      setOpen(false);
      triggerRef.current?.focus();
    }, []),
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return { open, setOpen, close, toggle, rootRef, triggerRef };
}
