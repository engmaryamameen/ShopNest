'use client';

import { useId, useState } from 'react';
import { ChevronDownIcon, GridIcon, SearchIcon } from '@/assets/icons';
import { usePopover } from './use-popover';
import { CategoryPickerPanel } from './category-picker-panel';
import { FOCUS_RING_INSET } from './styles';
import type { HeaderCategory } from './types';

/**
 * The storefront search form. One implementation is shared by every
 * viewport — parents reposition it with flex `order`/`basis` utilities
 * rather than duplicating the markup for mobile vs. desktop.
 */
export function SearchBar({ categories, className = '' }: { categories: HeaderCategory[]; className?: string }) {
  const [scopeSlug, setScopeSlug] = useState<string | null>(null);
  const scope = usePopover<HTMLFormElement, HTMLButtonElement>();
  const inputId = useId();

  const scopeLabel = scopeSlug ? categories.find((category) => category.slug === scopeSlug)?.name ?? 'All categories' : 'All categories';

  return (
    <form action="/shop" method="GET" role="search" ref={scope.rootRef} className={`relative ${className}`}>
      <div className="flex h-11 items-stretch overflow-hidden rounded-xl border-2 border-brand-600 bg-white transition-shadow focus-within:shadow-[0_0_0_4px_rgba(15,122,92,0.15)] sm:h-12">
        <div className="hidden shrink-0 sm:block">
          <button
            ref={scope.triggerRef}
            type="button"
            onClick={scope.toggle}
            aria-haspopup="listbox"
            aria-expanded={scope.open}
            className={`flex h-full items-center gap-1.5 border-r border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 lg:max-w-44 lg:px-3.5 lg:text-[13px] ${FOCUS_RING_INSET}`}
          >
            <GridIcon className="h-4 w-4 shrink-0 text-zinc-400 lg:hidden" />
            <span className="hidden max-w-32 truncate lg:inline">{scopeLabel}</span>
            <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${scope.open ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <label htmlFor={inputId} className="sr-only">
          Search products, categories and brands
        </label>
        <input
          id={inputId}
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Search products, categories and brands"
          className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 sm:px-4"
        />
        <input type="hidden" name="category" value={scopeSlug ?? ''} />

        <button
          type="submit"
          aria-label="Search"
          className={`grid w-12 shrink-0 place-items-center bg-brand-600 text-white transition-colors hover:bg-brand-700 sm:w-14 ${FOCUS_RING_INSET}`}
        >
          <SearchIcon className="h-[19px] w-[19px] sm:h-5 sm:w-5" />
        </button>
      </div>

      {scope.open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 hidden sm:block">
          <CategoryPickerPanel
            categories={categories}
            allLabel="All categories"
            selectedSlug={scopeSlug}
            onSelect={setScopeSlug}
            onRequestClose={scope.close}
            className="w-72"
          />
        </div>
      )}
    </form>
  );
}
