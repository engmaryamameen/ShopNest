'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HeaderCategory } from '@/components/shop/nav/types';
import { CategoryIcon } from '@/lib/category-icons';

const CARD_WIDTH = 170;
const CARD_GAP = 30;

function formatCategoryName(name: string) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d={direction === 'left' ? 'M20 12H4m6-6-6 6 6 6' : 'M4 12h16m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CategoryBrowser({ categories }: { categories: HeaderCategory[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollLeft(rail.scrollLeft > 2);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateControls();

    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateControls);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [categories.length, updateControls]);

  if (categories.length === 0) return null;

  function scroll(direction: 'left' | 'right') {
    railRef.current?.scrollBy({
      left: (CARD_WIDTH + CARD_GAP) * (direction === 'left' ? -3 : 3),
      behavior: 'smooth',
    });
  }

  return (
    <section aria-labelledby="category-browser-title" className="w-full flex flex-col lg:gap-1">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="h-10 w-1 rounded bg-[#DB4444]" />
        <p className="text-base font-bold leading-5 text-[#DB4444]">Categories</p>
      </div>

      <div className="flex flex-col gap-3 lg:gap-5">
        <div className="flex items-center justify-between ">
          <h2
            id="category-browser-title"
            className="text-[clamp(1.75rem,4vw,2rem)] font-bold leading-tight tracking-[0.01em] text-black"
          >
            Browse By Category
          </h2>

          <div className="flex shrink-0 gap-2">
            {(['left', 'right'] as const).map((direction) => {
              const disabled = direction === 'left' ? !canScrollLeft : !canScrollRight;
              return (
                <button
                  key={direction}
                  type="button"
                  aria-label={`Scroll categories ${direction}`}
                  disabled={disabled}
                  onClick={() => scroll(direction)}
                  className="grid size-[46px] cursor-pointer place-items-center rounded-full bg-[#F5F5F5] text-black transition-colors hover:bg-[#e9e9e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-black/25"
                >
                  <ArrowIcon direction={direction} />
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={railRef}
          onScroll={updateControls}
          className="scrollbar-none flex snap-x snap-mandatory gap-[30px] overflow-x-auto"
        >
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/shop?category=${encodeURIComponent(category.slug)}`}
              className="group flex h-[145px] w-[170px] shrink-0 snap-start cursor-pointer flex-col items-center justify-center gap-4 rounded border border-black/30 bg-white text-black transition-[background-color,border-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#DB4444] hover:bg-[#DB4444] hover:text-white hover:shadow-[0_8px_24px_rgba(219,68,68,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DB4444] focus-visible:ring-offset-2 motion-reduce:transform-none"
            >
              <CategoryIcon slug={`${category.slug} ${category.name}`} />
              <span className="max-w-[150px] truncate px-2 text-base leading-6">
                {formatCategoryName(category.name)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
