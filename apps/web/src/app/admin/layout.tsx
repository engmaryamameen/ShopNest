import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  try {
    const result = (await api.me(cookieHeader)) as { user: { role: string } };
    if (result.user.role !== 'ADMIN') {
      redirect('/shop');
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/admin');
    }
    throw err;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin header */}
      <header className="bg-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-xl font-bold">ShopNest Admin</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin/orders" className="text-indigo-200 hover:text-white transition-colors">Orders</Link>
              <Link href="/admin/products" className="text-indigo-200 hover:text-white transition-colors">Products</Link>
              <Link href="/admin/categories" className="text-indigo-200 hover:text-white transition-colors">Categories</Link>
            </nav>
          </div>
          <Link href="/shop" className="text-sm text-indigo-300 hover:text-white">
            ← Back to shop
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
