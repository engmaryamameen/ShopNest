'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';

import { ProductCard } from './product-card';
import type { ProductCardData } from './product.types';
import { HorizontalFadeScroll } from '@/components/shared/horizontal-fade-effect';

type ProductSectionRows = 1 | 2;

interface ProductSectionProps {
  eyebrow?: string;
  title: string;
  products: ProductCardData[];

  viewAllHref?: string;
  viewAllLabel?: string;

  emptyMessage?: string;
  showCategory?: boolean;

  /**
   * Number of visible product rows inside the horizontal scroller.
   *
   * 1 = default horizontal carousel.
   * 2 = two-row horizontal carousel.
   */
  rows?: ProductSectionRows;

  /**
   * Whether to render previous / next controls.
   */
  showNavigation?: boolean;

  /**
   * Shows the View All CTA when the section is hovered.
   */
  showViewAllOnHover?: boolean;
}

const SCROLL_AMOUNT_RATIO = 0.82;

export function ProductSection({
  eyebrow,
  title,
  products,
  viewAllHref,
  viewAllLabel = 'View All Products',
  emptyMessage = 'No products are currently available.',
  showCategory = false,
  rows = 1,
  showNavigation = true,
  showViewAllOnHover = true,
}: ProductSectionProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });

  function scroll(direction: 'previous' | 'next') {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const distance =
      scroller.clientWidth * SCROLL_AMOUNT_RATIO;

    scroller.scrollBy({
      left: direction === 'next' ? distance : -distance,
      behavior: 'smooth',
    });
  }

  return (
    <section
      aria-labelledby="product-section-title"
      className="group/section relative w-full font-poppins"
    >
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        showNavigation={
          showNavigation && products.length > 0
        }
        canScrollPrevious={scrollState.canScrollLeft}
        canScrollNext={scrollState.canScrollRight}
        onPrevious={() => scroll('previous')}
        onNext={() => scroll('next')}
      />

      {products.length > 0 ? (
        <>
          <HorizontalFadeScroll
            scrollRef={scrollerRef}
            onScrollStateChange={setScrollState}
            className="mt-8"
            viewportClassName={`
              grid w-full auto-cols-max grid-flow-col gap-x-4 gap-y-8
              overflow-x-auto overscroll-x-contain scroll-smooth pb-2
              [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
              sm:gap-x-5
              ${rows === 2 ? 'grid-rows-2' : 'grid-rows-1'}
            `}
          >
            {products.map((product, index) => (
              <div key={product.id} className="w-[300px] snap-start shrink-0">
                <ProductCard
                  product={product}
                  priority={index < (rows === 2 ? 8 : 4)}
                  showCategory={showCategory}
                />
              </div>
            ))}
          </HorizontalFadeScroll>

          {viewAllHref ? (
            <ViewAllAction
              href={viewAllHref}
              label={viewAllLabel}
              revealOnHover={showViewAllOnHover}
            />
          ) : null}
        </>
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  showNavigation,
  canScrollPrevious,
  canScrollNext,
  onPrevious,
  onNext,
}: {
  eyebrow?: string;
  title: string;
  showNavigation: boolean;
  canScrollPrevious: boolean;
  canScrollNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <header>
      {eyebrow ? (
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-10 w-1 rounded-full bg-[#DB4444]"
          />

          <p className="text-[14px] font-semibold leading-5 text-[#DB4444] sm:text-[16px]">
            {eyebrow}
          </p>
        </div>
      ) : null}

      <div
        className={`
          flex items-center justify-between
          gap-4
          ${eyebrow ? 'mt-4' : ''}
        `}
      >
        <h2
          id="product-section-title"
          className="
            text-[26px]
            font-semibold
            leading-tight
            tracking-[0.01em]
            text-black

            sm:text-[30px]
            lg:text-[32px]
          "
        >
          {title}
        </h2>

        {showNavigation ? (
          <div className="flex shrink-0 items-center gap-2">
            <ScrollButton
              direction="previous"
              onClick={onPrevious}
              disabled={!canScrollPrevious}
            />

            <ScrollButton
              direction="next"
              onClick={onNext}
              disabled={!canScrollNext}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function ScrollButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
  disabled: boolean;
}) {
  const isPrevious = direction === 'previous';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        isPrevious
          ? 'Previous products'
          : 'Next products'
      }
      className="
        flex h-10 w-10
        items-center justify-center
        rounded-full
        bg-[#F5F5F5]
        text-black
        transition-all
        duration-200

        hover:scale-[1.04]
        hover:bg-[#EEEEEE]

        active:scale-95

        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-black/20
        focus-visible:ring-offset-2

        disabled:cursor-not-allowed
        disabled:text-black/25
        disabled:hover:scale-100
        disabled:hover:bg-[#F5F5F5]

        sm:h-11
        sm:w-11
      "
    >
      <ArrowIcon
        className={`
          h-5 w-5
          ${isPrevious ? 'rotate-180' : ''}
        `}
      />
    </button>
  );
}

function ViewAllAction({
  href,
  label,
  revealOnHover,
}: {
  href: string;
  label: string;
  revealOnHover: boolean;
}) {
  return (
    <div
      className={`
        flex justify-center
        pt-8
        transition-all
        duration-300

        sm:pt-10

        ${
          revealOnHover
            ? `
              sm:pointer-events-none
              sm:translate-y-2
              sm:opacity-0

              sm:group-hover/section:pointer-events-auto
              sm:group-hover/section:translate-y-0
              sm:group-hover/section:opacity-100

              sm:group-focus-within/section:pointer-events-auto
              sm:group-focus-within/section:translate-y-0
              sm:group-focus-within/section:opacity-100
            `
            : ''
        }
      `}
    >
      <Link
        href={href}
        className="
          inline-flex
          min-h-[44px]
          items-center justify-center
          rounded-[4px]
          bg-[#DB4444]
          px-8
          text-[13px]
          font-medium
          text-white
          transition-all
          duration-200

          hover:bg-[#C93D3D]

          active:scale-[0.98]

          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#DB4444]/40
          focus-visible:ring-offset-2

          sm:min-w-[190px]
          sm:text-[14px]
        "
      >
        {label}
      </Link>
    </div>
  );
}

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div
      className="
        mt-8
        rounded-[6px]
        border border-black/[0.08]
        bg-[#FAFAFA]
        px-6
        py-14
        text-center
      "
    >
      <p className="text-[13px] text-black/45">
        {message}
      </p>
    </div>
  );
}

function ArrowIcon({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 12H19M13 6L19 12L13 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}