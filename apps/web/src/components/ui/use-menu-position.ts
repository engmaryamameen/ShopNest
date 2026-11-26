'use client';

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
  type KeyboardEvent,
} from 'react';

export function useMenuPosition(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  limit = 240,
): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({ maxHeight: limit });
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      if (!root.current || !anchor.current || !menu.current) return;
      const field = anchor.current.getBoundingClientRect();
      const container = root.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(
        viewport?.offsetTop ?? 0,
        document.querySelector('[data-admin-header]')?.getBoundingClientRect().bottom ?? 0,
      );
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const below = bottom - field.bottom - 8;
      const above = field.top - top - 8;
      const desired = Math.min(limit, menu.current.scrollHeight || limit);
      const flip = below < desired && above > below;
      const next = {
        top: flip ? 'auto' : field.bottom - container.top + 4,
        bottom: flip ? container.bottom - field.top + 4 : 'auto',
        maxHeight: Math.max(0, Math.min(limit, flip ? above : below)),
      };
      setPosition((current) =>
        current.top === next.top &&
        current.bottom === next.bottom &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (anchor.current) observer.observe(anchor.current);
    if (menu.current) observer.observe(menu.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [open, root, anchor, menu, limit]);
  return position;
}

export function navigateListbox(event: KeyboardEvent, list: HTMLElement | null) {
  if (!list || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const options = Array.from(
    list.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'),
  );
  if (!options.length) return;
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  event.preventDefault();
  options[next].focus();
}
