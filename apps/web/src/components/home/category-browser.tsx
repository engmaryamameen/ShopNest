'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HeaderCategory } from '@/components/shop/nav/types';

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

function CategoryIcon({ slug }: { slug: string }) {
  const normalized = slug.toLowerCase();

  if (/phone|mobile/.test(normalized)) {
    return (
      <path d="M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 15h4" />
    );
  }
  if (/computer|laptop/.test(normalized)) {
    return <path d="M4 5h16v11H4V5Zm-2 14h20M9 16v3m6-3v3" />;
  }
  if (/watch/.test(normalized)) {
    return (
      <path d="M9 2h6l1 4H8l1-4Zm-1 16h8l-1 4H9l-1-4Zm4-10v4l2 1m-6-7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    );
  }
  if (/camera/.test(normalized)) {
    return (
      <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    );
  }
  if (/headphone|audio/.test(normalized)) {
    return (
      <path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2Zm16 0h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2Z" />
    );
  }
  if (/game/.test(normalized)) {
    return (
      <path d="M7 8h10a5 5 0 0 1 4.7 6.7l-1 2.8a2.4 2.4 0 0 1-4.1.7L15 16H9l-1.6 2.2a2.4 2.4 0 0 1-4.1-.7l-1-2.8A5 5 0 0 1 7 8Zm0 3v4m-2-2h4m7-1h.01M18 14h.01" />
    );
  }
  if (/beauty|skin|fragrance/.test(normalized)) {
    return <path d="M9 3h6v4l2 3v10H7V10l2-3V3Zm0 4h6M9 13h6" />;
  }
  if (/home|furniture|decor/.test(normalized)) {
    return <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" />;
  }
  if (/sport|outdoor/.test(normalized)) {
    return (
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-8 8h16M7 5.5c3 3 3 10 0 13m10-13c-3 3-3 10 0 13" />
    );
  }

  return <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />;
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
    <section
      aria-labelledby="category-browser-title"
      className="mx-auto w-full max-w-[1170px] px-4 py-16 sm:px-6 lg:px-0 lg:py-[60px]"
    >
      <div className="mb-10 flex items-end justify-between gap-6 lg:mb-[60px]">
        <div className="flex flex-col items-start gap-5">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="h-10 w-5 rounded bg-[#DB4444]" />
            <p className="font-poppins text-base font-semibold leading-5 text-[#DB4444]">
              Categories
            </p>
          </div>
          <h2
            id="category-browser-title"
            className="font-poppins text-[clamp(1.75rem,4vw,2.25rem)] font-semibold leading-tight tracking-[0.01em] text-black"
          >
            Browse By Category
          </h2>
        </div>

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
        className="scrollbar-none flex snap-x snap-mandatory gap-[30px] overflow-x-auto pb-1"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/shop?category=${encodeURIComponent(category.slug)}`}
            className="group flex h-[145px] w-[170px] shrink-0 snap-start cursor-pointer flex-col items-center justify-center gap-4 rounded border border-black/30 bg-white text-black transition-[background-color,border-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#DB4444] hover:bg-[#DB4444] hover:text-white hover:shadow-[0_8px_24px_rgba(219,68,68,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DB4444] focus-visible:ring-offset-2 motion-reduce:transform-none"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <CategoryIcon slug={`${category.slug} ${category.name}`} />
            </svg>
            <span className="max-w-[150px] truncate px-2 font-poppins text-base leading-6">
              {formatCategoryName(category.name)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
