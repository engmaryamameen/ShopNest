import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  try {
    await api.me(cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/vendor');
    }
    throw err;
  }

  // Deliberately not gating on role/application status here — a customer
  // who hasn't applied yet, and a PENDING/REJECTED/SUSPENDED applicant,
  // both need to reach /vendor (to apply, or to see their status) rather
  // than being redirected away. Each page resolves its own vendor.me()
  // state and renders the right thing for it; only the functional pages
  // (offers/orders/staff) assume APPROVED, and the API independently
  // enforces that regardless of what the UI shows.
  let isApproved = false;
  try {
    const vendor = await api.vendorMe(cookieHeader);
    isApproved = vendor.status === 'APPROVED';
  } catch {
    // No application yet — fine, nav just won't show the functional links.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/vendor" className="text-xl font-bold">ShopNest for Vendors</Link>
            {isApproved && (
              <nav className="flex gap-4 text-sm">
                <Link href="/vendor" className="text-emerald-200 hover:text-white transition-colors">Dashboard</Link>
                <Link href="/vendor/offers" className="text-emerald-200 hover:text-white transition-colors">Offers</Link>
                <Link href="/vendor/orders" className="text-emerald-200 hover:text-white transition-colors">Orders</Link>
                <Link href="/vendor/returns" className="text-emerald-200 hover:text-white transition-colors">Returns</Link>
                <Link href="/vendor/promotions" className="text-emerald-200 hover:text-white transition-colors">Promotions</Link>
                <Link href="/vendor/staff" className="text-emerald-200 hover:text-white transition-colors">Staff</Link>
              </nav>
            )}
          </div>
          <Link href="/shop" className="text-sm text-emerald-300 hover:text-white">
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
