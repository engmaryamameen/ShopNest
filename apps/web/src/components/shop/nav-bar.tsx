'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/user.store';
import { api } from '@/lib/api';
import { useCartCount } from '@/lib/use-cart';
import type { UserIdentity } from '@/store/user.store';

export interface HeaderCategory {
  id: string;
  name: string;
  slug: string;
}

function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L20.5 8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}

export function NavBar({ categories, initialUser }: { categories: HeaderCategory[]; initialUser: UserIdentity | null }) {
  const router = useRouter();
  const { user, setUser } = useUserStore();
  const currentUser = user ?? initialUser;
  const cartCount = useCartCount(Boolean(currentUser));
  const featuredCategories = categories.slice(0, 7);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      router.push('/shop');
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <div className="hidden border-b border-slate-100 bg-slate-950 text-slate-200 lg:block">
        <div className="mx-auto flex h-8 max-w-[1440px] items-center justify-between px-6 text-[11px] font-medium tracking-wide">
          <p>Welcome to ShopNest — discover trusted sellers in one place</p>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5"><Icon name="shield" className="h-3.5 w-3.5" />Secure payments</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="truck" className="h-4 w-4" />Fast delivery</span>
            <Link href="/orders" className="transition-colors hover:text-white">Track order</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <div className="flex h-[72px] items-center gap-3 lg:h-[82px] lg:gap-6">
          <Link href="/shop" aria-label="ShopNest home" className="group flex shrink-0 items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.22)] transition-transform group-hover:-translate-y-0.5">
              <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12h16l-1.4 13H9.4L8 12Z" /><path d="M12 13V9a4 4 0 0 1 8 0v4" /><path d="m13 18 2.1 2.1L20 16" />
              </svg>
            </span>
            <span className="hidden text-[25px] font-extrabold tracking-[-0.8px] text-slate-950 sm:block">Shop<span className="text-indigo-600">Nest</span></span>
          </Link>

          <form action="/shop" method="GET" role="search" className="order-last flex h-12 min-w-0 flex-1 basis-full overflow-hidden rounded-xl border-2 border-indigo-600 bg-white shadow-sm max-lg:absolute max-lg:left-4 max-lg:right-4 max-lg:top-[72px] lg:order-none lg:basis-auto">
            <label htmlFor="header-category" className="sr-only">Product category</label>
            <select id="header-category" name="category" defaultValue="" className="hidden w-40 cursor-pointer border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none xl:block">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
            </select>
            <label htmlFor="header-search" className="sr-only">Search products</label>
            <input id="header-search" name="q" type="search" autoComplete="off" placeholder="Search products, categories and brands" className="min-w-0 flex-1 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="submit" aria-label="Search" className="grid w-12 shrink-0 place-items-center bg-indigo-600 text-white transition-colors hover:bg-indigo-700 lg:w-14">
              <Icon name="search" className="h-[21px] w-[21px]" />
            </button>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
            <button type="button" className="hidden items-center gap-2 rounded-xl px-2.5 py-2 text-left text-slate-700 transition-colors hover:bg-slate-50 xl:flex">
              <Icon name="pin" className="h-5 w-5 text-indigo-600" />
              <span><span className="block text-[10px] font-medium text-slate-400">Deliver to</span><span className="block max-w-24 truncate text-xs font-bold text-slate-800">Your location</span></span>
            </button>

            <Link href={currentUser ? '/orders' : '/login'} className="flex items-center gap-2 rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-50 lg:px-2.5" aria-label={currentUser ? 'Your account' : 'Sign in'}>
              <Icon name="user" className="h-[22px] w-[22px]" />
              <span className="hidden text-left lg:block"><span className="block text-[10px] font-medium text-slate-400">{currentUser ? 'Welcome back' : 'Hello, sign in'}</span><span className="block max-w-24 truncate text-xs font-bold text-slate-800">{currentUser?.email ?? 'Account'}</span></span>
            </Link>

            <Link href="/cart" aria-label={cartCount > 0 ? `Cart with ${cartCount} items` : 'Cart'} className="relative rounded-xl p-2.5 text-slate-700 transition-colors hover:bg-slate-50">
              <Icon name="cart" className="h-6 w-6" />
              {cartCount > 0 && <span className="absolute right-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-slate-950 ring-2 ring-white">{cartCount > 99 ? '99+' : cartCount}</span>}
            </Link>

            {currentUser && <button type="button" onClick={handleLogout} className="hidden text-xs font-semibold text-slate-500 hover:text-red-600 xl:block">Sign out</button>}
          </div>
        </div>

        <div className="h-14 lg:hidden" aria-hidden="true" />
      </div>

      <nav aria-label="Store categories" className="hidden border-t border-slate-100 lg:block">
        <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-1 px-6">
          <Link href="/shop" className="mr-3 inline-flex h-full items-center gap-2 border-r border-slate-200 pr-5 text-xs font-bold text-slate-900 hover:text-indigo-600">
            <Icon name="menu" className="h-[18px] w-[18px]" />All categories<Icon name="chevron" className="h-4 w-4" />
          </Link>
          {featuredCategories.map((category) => (
            <Link key={category.id} href={`/shop?category=${encodeURIComponent(category.slug)}`} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700">
              {category.name}
            </Link>
          ))}
          <Link href="/shop" className="ml-auto rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">Today&apos;s deals</Link>
        </div>
      </nav>
    </header>
  );
}
