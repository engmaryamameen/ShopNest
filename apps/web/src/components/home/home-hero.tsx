import type { HeaderCategory } from '@/components/shop/nav/types';

import { CategoryRail } from './category-rail';
import { HeroCarousel } from './hero-carousel';

export function HomeHero({ categories }: { categories: HeaderCategory[] }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-14 xl:pt-8">
      <div className="flex items-stretch gap-7 2xl:gap-9">
        <CategoryRail categories={categories} />
        <div className="min-w-0 flex-1">
          <HeroCarousel />
        </div>
      </div>
    </div>
  );
}
