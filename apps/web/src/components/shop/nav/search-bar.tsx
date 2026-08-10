'use client';

import { useId, useState } from 'react';

import {
  ChevronDownIcon,
  SearchIcon,
} from '@/assets/icons';

import { CategoryPickerPanel } from './category-picker-panel';
import { FOCUS_RING_INSET } from './styles';
import type { HeaderCategory } from './types';
import { usePopover } from './use-popover';

type SearchBarProps = {
  categories: HeaderCategory[];
  className?: string;
};

export function SearchBar({
  categories,
  className = '',
}: SearchBarProps) {
  const [scopeSlug, setScopeSlug] = useState<string | null>(null);

  const scope = usePopover<HTMLFormElement, HTMLButtonElement>();
  const inputId = useId();

  const scopeLabel = scopeSlug
    ? categories.find((category) => category.slug === scopeSlug)?.name ??
      'All'
    : 'All';

  return (
    <form
      ref={scope.rootRef}
      action="/shop"
      method="GET"
      role="search"
      className={`relative w-full lg:w-[420px] xl:w-[460px] ${className}`}
    >
      <div
        className="
          flex h-[38px] w-full items-center
          rounded-[4px] bg-[#F5F5F5]
        "
      >
        {/* Category scope */}
        <button
          ref={scope.triggerRef}
          type="button"
          onClick={scope.toggle}
          aria-haspopup="listbox"
          aria-expanded={scope.open}
          className={`
            flex h-full max-w-[145px] shrink-0
            items-center gap-[6px]
            border-r border-black/[0.08]
            px-3.5
            text-[12px] font-normal leading-[18px]
            text-black
            transition-colors duration-200
            hover:bg-black/[0.025]
            cursor-pointer
            ${FOCUS_RING_INSET}
          `}
        >
          <span className="truncate">
            {scopeLabel}
          </span>

          <ChevronDownIcon
            className={`
              h-3 w-3 shrink-0 text-black/60
              transition-transform duration-200
              ${scope.open ? 'rotate-180' : ''}
            `}
          />
        </button>

        {/* Search input */}
        <div className="flex min-w-0 flex-1 items-center pl-4 pr-3">
          <label htmlFor={inputId} className="sr-only">
            What are you looking for?
          </label>

          <input
            id={inputId}
            name="q"
            type="search"
            autoComplete="off"
            placeholder="What are you looking for?"
            className="
              min-w-0 flex-1
              bg-transparent
              text-[12px] font-normal leading-[18px]
              text-black
              outline-none
              placeholder:text-black/50
              [&::-webkit-search-cancel-button]:hidden
              [&::-webkit-search-decoration]:hidden
            "
          />

          <input
            type="hidden"
            name="category"
            value={scopeSlug ?? ''}
          />

          <button
            type="submit"
            aria-label="Search"
            className={`
              ml-3
              flex h-6 w-6 shrink-0
              items-center justify-center
              text-black
              transition-opacity duration-200
              hover:opacity-60
              ${FOCUS_RING_INSET}
            `}
          >
            <SearchIcon className="h-5 w-5 cursor-pointer" />
          </button>
        </div>
      </div>

      {/* Category dropdown */}
      {scope.open && (
        <div
          className="
            absolute left-0 top-[calc(100%+8px)]
            z-50
          "
        >
          <CategoryPickerPanel
            categories={categories}
            allLabel="All categories"
            selectedSlug={scopeSlug}
            onSelect={(slug) => {
              setScopeSlug(slug);
              scope.close();
            }}
            onRequestClose={scope.close}
            className="w-[280px] cursor-pointer"
          />
        </div>
      )}
    </form>
  );
}