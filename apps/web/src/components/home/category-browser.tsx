'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

import type { HeaderCategory } from '@/components/shop/nav/types';
import { CategoryIcon } from '@/lib/category-icons';
import { HorizontalFadeScroll } from '@/components/shared/horizontal-fade-effect';

const CARD_WIDTH = 170;
const CARD_GAP = 30;
const DESKTOP_SCROLL_AMOUNT = (CARD_WIDTH + CARD_GAP) * 3;

function formatCategoryName(name: string) {
  return name
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d={
          direction === 'left'
            ? 'M20 12H4m6-6-6 6 6 6'
            : 'M4 12h16m-6-6 6 6-6 6'
        }
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CategoryBrowser({
  categories,
}: {
  categories: HeaderCategory[];
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollState = useCallback(
    (state: {
      canScrollLeft: boolean;
      canScrollRight: boolean;
    }) => {
      setScrollState(state);
    },
    [],
  );

  if (categories.length === 0) {
    return null;
  }

  function scroll(direction: 'left' | 'right') {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    const distance = Math.min(
      DESKTOP_SCROLL_AMOUNT,
      Math.max(rail.clientWidth * 0.8, CARD_WIDTH + CARD_GAP),
    );

    rail.scrollBy({
      left: distance * (direction === 'left' ? -1 : 1),
      behavior: 'smooth',
    });
  }

  return (
    <section
      aria-labelledby="category-browser-title"
      className="flex w-full flex-col gap-5"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="h-10 w-1 rounded-full bg-[#DB4444]"
        />

        <p className="text-base font-bold leading-5 text-[#DB4444]">
          Categories
        </p>
      </div>

      <div className="flex items-center justify-between gap-6">
        <h2
          id="category-browser-title"
          className="text-[clamp(1.75rem,4vw,2rem)] font-bold leading-tight tracking-[0.01em] text-black"
        >
          Browse By Category
        </h2>

        <div className="flex shrink-0 gap-2">
          {(['left', 'right'] as const).map((direction) => {
            const disabled =
              direction === 'left'
                ? !scrollState.canScrollLeft
                : !scrollState.canScrollRight;

            return (
              <button
                key={direction}
                type="button"
                aria-label={`Scroll categories ${direction}`}
                disabled={disabled}
                onClick={() => scroll(direction)}
                className={[
                  'grid size-[46px] place-items-center rounded-full',
                  'bg-[#F5F5F5] text-black',
                  'transition-[background-color,color,transform] duration-200',
                  'hover:bg-[#e9e9e9] active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-black focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:text-black/25',
                  'disabled:hover:bg-[#F5F5F5]',
                ].join(' ')}
              >
                <ArrowIcon direction={direction} />
              </button>
            );
          })}
        </div>
      </div>

      <HorizontalFadeScroll
        scrollRef={railRef}
        onScrollStateChange={updateScrollState}
        viewportClassName={[
          'flex snap-x snap-mandatory gap-[30px] overflow-x-auto',
          'scroll-smooth py-1',
        ].join(' ')}
      >
        {categories.map((category, index) => (
          <Link
            key={category.id}
            href={`/shop?category=${encodeURIComponent(category.slug)}`}
            aria-label={`Browse ${formatCategoryName(category.name)}`}
            className={[
              'group relative flex h-[180px] w-[213px] shrink-0 snap-start',
              'flex-col items-center justify-between overflow-hidden',
              'rounded-md border border-black/25 bg-white px-3 pb-5 pt-3',
              'text-center text-black',
              'transition-[background-color,border-color,color,transform,box-shadow]',
              'duration-300 ease-out',
              'hover:-translate-y-1 hover:border-[#DB4444]',
              'hover:bg-[#DB4444] hover:text-white',
              'hover:shadow-[0_14px_32px_rgba(219,68,68,0.2)]',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[#DB4444] focus-visible:ring-offset-2',
              'motion-reduce:transform-none',
              'sm:h-[180px] sm:w-[213px]',
              'lg:h-[180px] lg:w-[213px]',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'absolute inset-x-5 top-3 h-20 rounded-full',
                'bg-[#DB4444]/0 blur-2xl transition-colors duration-300',
                'group-hover:bg-white/10',
              ].join(' ')}
            />

            <CategoryIcon
              slug={category.slug}
              name={category.name}
              priority={index < 7}
            />

            <span className="relative line-clamp-2 min-h-6 max-w-[180px] text-base font-medium leading-6">
              {formatCategoryName(category.name)}
            </span>
          </Link>
        ))}
      </HorizontalFadeScroll>
    </section>
  );
}