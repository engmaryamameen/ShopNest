'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/user.store';
import { api } from '@/lib/api';
import { useCartCount } from '@/lib/use-cart';
import type { UserIdentity } from '@/store/user.store';
import { UtilityBar } from './nav/utility-bar';
import { PrimaryHeader } from './nav/primary-header';
import { MobileDrawer } from './nav/mobile-drawer';
import type { HeaderCategory } from './nav/types';

export type { HeaderCategory };

export function NavBar({ categories, initialUser }: { categories: HeaderCategory[]; initialUser: UserIdentity | null }) {
  const router = useRouter();
  const { user, setUser } = useUserStore();
  const currentUser = user ?? initialUser;
  const cartCount = useCartCount(Boolean(currentUser));
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleSignOut() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      router.push('/shop');
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white shadow-[0_1px_0_rgba(23,20,15,0.03)]">
      <UtilityBar />
      <PrimaryHeader
        categories={categories}
        currentUser={currentUser}
        cartCount={cartCount}
        onSignOut={handleSignOut}
        onOpenMenu={() => setDrawerOpen(true)}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        categories={categories}
        currentUser={currentUser}
        onSignOut={handleSignOut}
      />
    </header>
  );
}
