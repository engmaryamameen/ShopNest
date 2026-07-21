'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/user.store';
import { api } from '@/lib/api';
import { useCartCount } from '@/lib/use-cart';

export function NavBar() {
  const router = useRouter();
  const { user, setUser } = useUserStore();
  const cartCount = useCartCount();

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/shop" className="text-2xl font-bold text-indigo-600">
            ShopNest
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/shop" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              Shop
            </Link>

            {/* Cart link with item-count badge */}
            <Link
              href="/cart"
              className="relative text-gray-600 hover:text-gray-900 text-sm font-medium"
              aria-label={cartCount > 0 ? `Cart (${cartCount} items)` : 'Cart'}
            >
              Cart
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-4 min-w-4.5 h-4.5 flex items-center justify-center bg-indigo-600 text-white text-[0.65rem] font-bold rounded-full px-1 leading-none">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>

            <Link href="/orders" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              Orders
            </Link>
            {user?.role === 'ADMIN' && (
              <Link href="/admin" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                Admin
              </Link>
            )}
            {user ? (
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link href="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
