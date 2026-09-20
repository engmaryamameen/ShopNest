import { NavBar } from '@/components/shop/nav-bar';
import type { HeaderCategory } from '@/components/shop/nav-bar';
import { api } from '@/lib/api';
import { cookies } from 'next/headers';
import type { UserIdentity } from '@/store/user.store';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
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
    <div className="min-h-screen">
      <NavBar categories={categories} initialUser={initialUser} />
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
