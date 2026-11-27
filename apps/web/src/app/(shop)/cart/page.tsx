import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Cart } from '@/lib/use-cart';
import { CartView } from '@/components/shop/cart-view';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let cart: Cart;
  try {
    cart = await api.getCart(cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/cart');
    }
    throw err;
  }

  return <CartView initialCart={cart} />;
}
