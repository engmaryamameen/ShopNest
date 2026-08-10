'use client';

import Link from 'next/link';
import { ChevronDownIcon, GridIcon, TagIcon } from '@/assets/icons';
import { usePopover } from './use-popover';
import { CategoryPickerPanel } from './category-picker-panel';
import { FOCUS_RING } from './styles';
import type { HeaderCategory } from './types';

const MAX_FEATURED = 8;
/** Links beyond this index only surface once the `xl` breakpoint has room for them. */
const LG_VISIBLE_COUNT = 5;

/** Secondary desktop/laptop bar: the "all categories" mega menu, featured shortcuts, and the deals entry point. */
export function CategoryNav({ categories }: { categories: HeaderCategory[] }) {
  const mega = usePopover<HTMLDivElement, HTMLButtonElement>();
  const featured = categories.slice(0, MAX_FEATURED);

  return (
    <nav aria-label="Store categories" className="hidden border-t border-zinc-100 lg:block">
      <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-1 px-6">
        <div ref={mega.rootRef} className="relative shrink-0">
          <button
            ref={mega.triggerRef}
            type="button"
            onClick={mega.toggle}
            aria-haspopup="listbox"
            aria-expanded={mega.open}
            className={`mr-3 flex h-8 items-center gap-2 rounded-lg border-r border-zinc-200 pr-5 text-xs font-bold text-zinc-900 transition-colors hover:text-brand-700 ${FOCUS_RING}`}
          >
            <GridIcon className="h-4 w-4" />
            All categories
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-150 ${mega.open ? 'rotate-180' : ''}`} />
          </button>

          {mega.open && (
            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40">
              <CategoryPickerPanel
                categories={categories}
                allLabel="All categories"
                getHref={(slug) => (slug ? `/shop?category=${encodeURIComponent(slug)}` : '/shop')}
                onRequestClose={mega.close}
                className="w-80"
              />
            </div>
          )}
        </div>

        {featured.map((category, index) => (
          <Link
            key={category.id}
            href={`/shop?category=${encodeURIComponent(category.slug)}`}
            className={`rounded-lg px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-brand-50 hover:text-brand-700 ${FOCUS_RING} ${
              index >= LG_VISIBLE_COUNT ? 'hidden xl:inline-flex' : ''
            }`}
          >
            {category.name}
          </Link>
        ))}

        <Link
          href="/shop"
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3.5 py-1.5 text-xs font-bold text-accent-700 transition-colors hover:bg-accent-100 ${FOCUS_RING}`}
        >
          <TagIcon className="h-3.5 w-3.5" />
          Today&apos;s deals
        </Link>
      </div>
    </nav>
  );
}
