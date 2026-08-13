import { cookies } from 'next/headers';

import { HomeHero } from '@/components/home/home-hero';
import { CategoryBrowser } from '@/components/home/category-browser';
import { NavBar, type HeaderCategory } from '@/components/shop/nav-bar';
import { api } from '@/lib/api';
import type { UserIdentity } from '@/store/user.store';
import { ProductSection } from '@/components/product/product-section';
import { ProductCardData } from '@/components/product/product.types';
import { NewArrivals } from '@/components/home/new-arrival';
import { ServiceBenefits } from '@/components/home/service-benefits';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  let categories: HeaderCategory[] = [];
  let products: ProductCardData[] = [];
  let initialUser: UserIdentity | null = null;

  const cookieHeader = (await cookies()).toString();

  const [categoriesResult, productsResult, userResult] = await Promise.allSettled([
    api.listCategories(),
    api.listProducts({
      page: 1,
      limit: 8,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    cookieHeader ? api.me(cookieHeader) : Promise.resolve(null),
  ]);

  if (categoriesResult.status === 'fulfilled') {
    categories = categoriesResult.value as HeaderCategory[];
  }

  if (productsResult.status === 'fulfilled') {
    products = productsResult.value.items as ProductCardData[];
  }

  if (userResult.status === 'fulfilled' && userResult.value) {
    initialUser = userResult.value.user as UserIdentity;
  }

  return (
    <div className="min-h-screen bg-white ">
      <NavBar categories={categories} initialUser={initialUser} />
      <main className="px-4 flex flex-col sm:px-6 lg:px-8 gap-10 font-lato lg:gap-20">
        <HomeHero categories={categories} />
        <CategoryBrowser categories={categories} />
        <ProductSection
          eyebrow="Best Selling"
          title="Best Selling Products"
          products={products}
          viewAllHref="/shop"
          showCategory
        />
        <NewArrivals />
        <ProductSection
          eyebrow="Our Products"
          title="Explore Our Products"
          products={products}
          viewAllHref="/shop"
          rows={2}
          />
        <ServiceBenefits />
      </main>
    </div>
  );
}
