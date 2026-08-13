'use client';

import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react';

type HorizontalFadeScrollProps = {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScrollStateChange?: (state: {
    canScrollLeft: boolean;
    canScrollRight: boolean;
  }) => void;
  className?: string;
  viewportClassName?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'onScroll'>;

export function HorizontalFadeScroll({
  children,
  scrollRef,
  onScrollStateChange,
  className = '',
  viewportClassName = '',
  ...props
}: HorizontalFadeScrollProps) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const viewport = scrollRef.current;

    if (!viewport) {
      return;
    }

    const nextState = {
      canScrollLeft: viewport.scrollLeft > 2,
      canScrollRight:
        viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2,
    };

    setCanScrollLeft(nextState.canScrollLeft);
    setCanScrollRight(nextState.canScrollRight);
    onScrollStateChange?.(nextState);
  }, [onScrollStateChange, scrollRef]);

  useEffect(() => {
    const viewport = scrollRef.current;

    if (!viewport) {
      return;
    }

    updateScrollState();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateScrollState);

    resizeObserver?.observe(viewport);

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(updateScrollState);

    mutationObserver?.observe(viewport, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('resize', updateScrollState);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [scrollRef, updateScrollState]);

  return (
    <div className={`relative min-w-0 ${className}`} {...props}>
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className={[
          'horizontal-scrollbar-hidden',
          'overscroll-x-contain',
          viewportClassName,
        ].join(' ')}
      >
        {children}
      </div>

      <span
        aria-hidden="true"
        data-visible={canScrollLeft}
        className={[
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-10',
          'bg-gradient-to-r from-white via-white/80 to-transparent',
          'opacity-0 transition-opacity duration-300',
          'data-[visible=true]:opacity-100',
          'sm:w-14',
        ].join(' ')}
      />

      <span
        aria-hidden="true"
        data-visible={canScrollRight}
        className={[
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-10',
          'bg-gradient-to-l from-white via-white/80 to-transparent',
          'opacity-0 transition-opacity duration-300',
          'data-[visible=true]:opacity-100',
          'sm:w-14',
        ].join(' ')}
      />
    </div>
  );
}