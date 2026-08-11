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
    <aside
      aria-label="Shop by category"
      className="hidden min-w-[224px] lg:max-h-[344px] lg:min-h-[344px] shrink-0 xl:block pt-[30px]"
    >
      <nav className="h-[344px] overflow-hidden">
        <ul className="w-full space-y-4">
          {visibleCategories.map((category, index) => (
            <li key={category.id}>
              <Link
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="group flex min-h-6 items-center justify-between rounded-lg text-sm text-[#49433c] transition-colors hover:text-[#17140f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17140f]"
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
