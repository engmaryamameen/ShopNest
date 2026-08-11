import { cookies } from 'next/headers';

import { HomeHero } from '@/components/home/home-hero';
import { NavBar, type HeaderCategory } from '@/components/shop/nav-bar';
import { api } from '@/lib/api';
import type { UserIdentity } from '@/store/user.store';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  let categories: HeaderCategory[] = [];
  let initialUser: UserIdentity | null = null;
  const cookieHeader = (await cookies()).toString();

  const [categoriesResult, userResult] = await Promise.allSettled([
    api.listCategories(),
    cookieHeader ? api.me(cookieHeader) : Promise.resolve(null),
  ]);

  if (categoriesResult.status === 'fulfilled') {
    categories = categoriesResult.value as HeaderCategory[];
  }

  if (userResult.status === 'fulfilled' && userResult.value) {
    initialUser = userResult.value.user as UserIdentity;
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar categories={categories} initialUser={initialUser} />
      <main>
        <HomeHero categories={categories} />
      </main>
    </div>
  );
}
