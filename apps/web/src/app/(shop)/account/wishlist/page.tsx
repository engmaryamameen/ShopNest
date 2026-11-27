import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { WishlistGrid } from '@/components/shop/wishlist-grid';

export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const cookieHeader = (await cookies()).toString();

  let items;
  try {
    items = await api.listWishlist(cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/account/wishlist');
    }
    throw err;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Wishlist</h1>
      <p className="text-gray-500 mb-8">Products you&rsquo;ve saved for later.</p>
      <WishlistGrid items={items} />
    </div>
  );
}
