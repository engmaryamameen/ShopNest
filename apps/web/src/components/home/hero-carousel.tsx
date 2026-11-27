'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HERO_SLIDES } from './hero-slides';

const AUTOPLAY_DELAY_MS = 4500;
const SLIDE_TRANSITION_MS = 900;

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M5 12h14M14 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(() => new Set([0]));
  const touchStartX = useRef<number | null>(null);

  const showSlide = useCallback((index: number) => {
    setActiveIndex((index + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => {
        const nextIndex = (current + 1) % HERO_SLIDES.length;
        return loadedSlides.has(nextIndex) ? nextIndex : current;
      });
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(interval);
  }, [isPaused, loadedSlides]);

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(distance) < 45) return;
    showSlide(activeIndex + (distance < 0 ? 1 : -1));
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured ShopNest campaigns"
      className="group relative isolate min-h-[390px] sm:min-h-[430px] lg:min-h-[344px] lg:max-h-[344px] overflow-hidden rounded-[28px] bg-[#151311] text-white shadow-[0_24px_70px_rgba(20,16,12,0.18)] lg:rounded-[32px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
      }}
      onTouchEnd={handleTouchEnd}
    >
      {HERO_SLIDES.map((slide, index) => {
        const isActive = index === activeIndex;

        return (
          <article
            key={slide.id}
            aria-hidden={!isActive}
            className={`absolute inset-0 will-change-[opacity] transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              isActive
                ? 'z-10 translate-x-0 opacity-100'
                : 'pointer-events-none z-0 translate-x-3 opacity-0'
            }`}
            style={{ transitionDuration: `${SLIDE_TRANSITION_MS}ms` }}
          >
            <Image
              src={slide.image}
              alt={slide.imageAlt}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : 'eager'}
              sizes="(max-width: 1024px) 100vw, 1020px"
              className="object-cover object-center sm:object-[58%_center]"
              onLoad={() => {
                setLoadedSlides((current) => {
                  if (current.has(index)) return current;
                  const next = new Set(current);
                  next.add(index);
                  return next;
                });
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,11,10,0.98)_0%,rgba(12,11,10,0.91)_33%,rgba(12,11,10,0.42)_60%,rgba(12,11,10,0.08)_100%)] sm:bg-[linear-gradient(90deg,rgba(12,11,10,0.98)_0%,rgba(12,11,10,0.88)_38%,rgba(12,11,10,0.18)_72%)]" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent sm:hidden" />

            <div className="relative z-10 flex min-h-[390px] max-w-[620px] flex-col justify-center px-6 lg:pb-29 pb-10 sm:min-h-[430px] sm:px-10 lg:min-h-[456px] lg:px-14">
              <div
                className={`mb-5 h-1 w-10 rounded-full ${slide.tone === 'burgundy' ? 'bg-[#dc334f]' : slide.tone === 'espresso' ? 'bg-[#d8a567]' : 'bg-[#f5d37a]'}`}
              />
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/72 sm:text-xs">
                {slide.eyebrow}
              </p>
              <h1 className="max-w-[590px] text-[clamp(2rem,5vw,3.00rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
                {slide.title}
              </h1>
              <p className="max-w-[500px] text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
                {slide.description}
              </p>
              <Link
                href={slide.href}
                tabIndex={isActive ? 0 : -1}
                className="mt-4  mb-8 inline-flex w-fit items-center gap-2.5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#17140f] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#f5f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:translate-y-0 motion-reduce:transform-none"
              >
                {slide.ctaLabel}
                <ArrowRightIcon />
              </Link>
            </div>
          </article>
        );
      })}

      <div className="absolute bottom-4 left-6 z-20 flex items-center gap-2.5 sm:left-10 lg:left-14">
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Show slide ${index + 1}: ${slide.eyebrow}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => showSlide(index)}
            className="group/dot grid size-7 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? 'w-7 bg-white'
                  : 'w-1.5 bg-white/45 group-hover/dot:bg-white/75'
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
