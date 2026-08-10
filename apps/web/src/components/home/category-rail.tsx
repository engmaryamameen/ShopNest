import Link from 'next/link';

import { ChevronRightIcon } from '@/assets/icons';
import type { HeaderCategory } from '@/components/shop/nav/types';

const CATEGORY_LIMIT = 10;

function formatCategoryName(name: string) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CategoryRail({ categories }: { categories: HeaderCategory[] }) {
  const visibleCategories = categories.slice(0, CATEGORY_LIMIT);

  if (visibleCategories.length === 0) return null;

  return (
    <aside aria-label="Shop by category" className="hidden w-[224px] shrink-0 xl:block">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-jakarta text-sm font-bold tracking-[-0.01em] text-[#17140f]">Shop by category</h2>
        <Link href="/shop" className="text-xs font-medium text-[#6f675e] underline-offset-4 hover:text-black hover:underline">
          View all
        </Link>
      </div>
      <nav className="border-r border-[#e8e3dc] pr-5">
        <ul className="space-y-0.5">
          {visibleCategories.map((category, index) => (
            <li key={category.id}>
              <Link
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="group flex min-h-9 items-center justify-between rounded-lg px-2.5 text-sm text-[#49433c] transition-colors hover:bg-[#f5f2ed] hover:text-[#17140f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17140f]"
              >
                <span className="truncate">{formatCategoryName(category.name)}</span>
                {index < 2 ? (
                  <ChevronRightIcon className="size-4 shrink-0 text-[#9b9288] transition-transform group-hover:translate-x-0.5 group-hover:text-[#17140f]" />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
