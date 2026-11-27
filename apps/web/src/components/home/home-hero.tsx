import type { HeaderCategory } from '@/components/shop/nav/types';

import { CategoryRail } from './category-rail';
import { HeroCarousel } from './hero-carousel';

export function HomeHero({ categories }: { categories: HeaderCategory[] }) {
  return (
    <div className="mx-auto w-full font-lato">
      <div className="flex w-full items-stretch gap-0 lg:gap-4">
        <div className="hidden lg:block">
          <CategoryRail categories={categories} />
        </div>
        <div className="hidden w-[0.5px] shrink-0 lg:block lg:bg-black/30" />
        <div className="min-w-0 w-full flex-1 py-4 sm:pt-7 lg:pl-[41px] lg:pt-[34px]">
          <HeroCarousel />
        </div>
      </div>
    </div>
  );
}
