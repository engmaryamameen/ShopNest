import type { HeaderCategory } from '@/components/shop/nav/types';

import { CategoryRail } from './category-rail';
import { HeroCarousel } from './hero-carousel';

export function HomeHero({ categories }: { categories: HeaderCategory[] }) {
  return (
    <div className="mx-auto max-w-[1440px] font-lato">
      <div className="flex items-stretch gap-4 2xl:gap-4">
        <CategoryRail categories={categories} />
        <div className="h-[374px] w-[.5px] bg-black/30" />
        <div className="min-w-0  flex-1 lg:pt-[45px] py-4 sm:px-6 sm:pt-7 pr-4 lg:pl-[41px]">
          <HeroCarousel />
        </div>
      </div>
    </div>
  );
}
