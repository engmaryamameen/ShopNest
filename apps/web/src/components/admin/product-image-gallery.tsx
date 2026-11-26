'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function ProductImageGallery({
  images,
  onUpload,
  onRemove,
  disabled,
}: {
  images: string[];
  onUpload: (file: File, index?: number) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [replacement, setReplacement] = useState<number | undefined>();
  const [selected, setSelected] = useState(0);
  const current = Math.min(selected, Math.max(0, images.length - 1));
  const updateOverflow = useCallback(() => {
    const element = strip.current;
    if (!element) return;
    const next = {
      left: element.scrollLeft > 1,
      right: element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
    };
    setOverflow((previous) =>
      previous.left === next.left && previous.right === next.right ? previous : next,
    );
  }, []);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    updateOverflow();
    return () => observer.disconnect();
  }, [updateOverflow]);
  useEffect(updateOverflow, [images, updateOverflow]);
  const fade =
    overflow.left && overflow.right
      ? 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
      : overflow.left
        ? 'linear-gradient(to right, transparent, black 24px)'
        : overflow.right
          ? 'linear-gradient(to left, transparent, black 24px)'
          : undefined;
  function choose(index?: number) {
    if (disabled || (index === undefined && images.length >= 20)) return;
    setReplacement(index);
    input.current?.click();
  }
  return (
    <section className="space-y-3" aria-labelledby="product-image-heading">
      <h3 id="product-image-heading" className="text-base font-semibold text-gray-900">
        Upload product image
      </h3>
      <p className="text-sm font-medium text-gray-700">Product image</p>
      <div className="relative flex h-[266px] items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white pb-10">
        {images[current] ? (
          <img
            src={images[current]}
            alt={`Product image ${current + 1}`}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-sm text-gray-500">No image selected</span>
        )}
        <button
          type="button"
          disabled={disabled || images.length >= 20}
          onClick={() => choose()}
          className="absolute bottom-3 left-3 flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 hover:text-[#0077b6] disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4.16667 17.5C3.70833 17.5 3.31611 17.3369 2.99 17.0108C2.66389 16.6847 2.50056 16.2922 2.5 15.8333V4.16667C2.5 3.70833 2.66333 3.31611 2.99 2.99C3.31667 2.66389 3.70889 2.50056 4.16667 2.5H15.8333C16.2917 2.5 16.6842 2.66333 17.0108 2.99C17.3375 3.31667 17.5006 3.70889 17.5 4.16667V15.8333C17.5 16.2917 17.3369 16.6842 17.0108 17.0108C16.6847 17.3375 16.2922 17.5006 15.8333 17.5H4.16667ZM5.83333 14.1667H14.1667C14.3333 14.1667 14.4583 14.0903 14.5417 13.9375C14.625 13.7847 14.6111 13.6389 14.5 13.5L12.2083 10.4375C12.125 10.3264 12.0139 10.2708 11.875 10.2708C11.7361 10.2708 11.625 10.3264 11.5417 10.4375L9.375 13.3333L7.83333 11.2708C7.75 11.1597 7.63889 11.1042 7.5 11.1042C7.36111 11.1042 7.25 11.1597 7.16667 11.2708L5.5 13.5C5.38889 13.6389 5.375 13.7847 5.45833 13.9375C5.54167 14.0903 5.66667 14.1667 5.83333 14.1667Z" />
          </svg>
          Browse
        </button>
        {images[current] && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => choose(current)}
            className="absolute bottom-3 right-3 flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 hover:text-[#0077b6] disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.474 12.526a6.4 6.4 0 0 1 5.817-10.795m3.868 2.481a6.4 6.4 0 0 1-6.645 10.014M11.891 5.24v-2.4h2.4l-2.4 2.4ZM4.039 10.691v2.4h-2.4l2.4-2.4Z" />
            </svg>
            Replace
          </button>
        )}
        <input
          ref={input}
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onUpload(file, replacement);
          }}
        />
      </div>
      <div
        ref={strip}
        role="region"
        aria-label="Product images"
        tabIndex={0}
        onScroll={updateOverflow}
        onFocusCapture={(event) => {
          (event.target as HTMLElement).closest<HTMLElement>('[data-image-tile]')?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          });
        }}
        className="flex min-w-0 max-w-full flex-nowrap gap-3 overflow-x-auto scroll-smooth p-1 motion-reduce:scroll-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
        style={{ maskImage: fade, WebkitMaskImage: fade, scrollbarWidth: 'thin' }}
      >
        {images.map((url, index) => (
          <div
            key={`${url}-${index}`}
            data-image-tile
            className={`relative h-[99px] w-[98px] shrink-0 rounded-lg border transition-colors motion-reduce:transition-none ${current === index ? 'border-[#0077b6]' : 'border-gray-200'}`}
          >
            <button
              type="button"
              aria-label={`View image ${index + 1}`}
              aria-pressed={current === index}
              onClick={() => setSelected(index)}
              className="h-full w-full rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6]"
            >
              <img src={url} alt="" className="h-full w-full object-contain" />
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove image ${index + 1}`}
              onClick={() => {
                onRemove(index);
                setSelected(
                  index < current ? current - 1 : Math.min(current, Math.max(0, images.length - 2)),
                );
              }}
              className="absolute right-1 top-1 rounded-full bg-white text-gray-500 hover:text-red-600"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6.113 9.887 3.773-3.774m0 3.774L6.113 6.113M8 14.667A6.667 6.667 0 1 0 8 1.333a6.667 6.667 0 0 0 0 13.334Z" />
              </svg>
            </button>
          </div>
        ))}
        {images.length < 20 && (
          <button
            type="button"
            data-image-tile
            disabled={disabled}
            onClick={() => choose()}
            className="flex h-[99px] w-[98px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-400 text-sm text-[#0077b6] transition-colors hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:opacity-50"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 1.5C6.20156 1.5 1.5 6.20156 1.5 12S6.20156 22.5 12 22.5 22.5 17.7984 22.5 12 17.7984 1.5 12 1.5Zm4.5 11.0625c0 .1031-.0844.1875-.1875.1875H12.75v3.5625c0 .1031-.0844.1875-.1875.1875h-1.125c-.1031 0-.1875-.0844-.1875-.1875V12.75H7.6875c-.1031 0-.1875-.0844-.1875-.1875v-1.125c0-.1031.0844-.1875.1875-.1875h3.5625V7.6875c0-.1031.0844-.1875.1875-.1875h1.125c.1031 0 .1875.0844.1875.1875v3.5625h3.5625c.1031 0 .1875.0844.1875.1875v1.125Z" />
            </svg>
            Add image
          </button>
        )}
      </div>
      {disabled && (
        <p role="status" className="text-xs text-gray-500">
          Preparing images…
        </p>
      )}
    </section>
  );
}
