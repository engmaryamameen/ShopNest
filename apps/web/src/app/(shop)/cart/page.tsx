import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { CartView } from '@/components/shop/cart-view';

export const dynamic = 'force-dynamic';

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    imageUrl?: string | null;
    stockQuantity: number;
  };
}

interface Cart {
  id: string;
  items: CartItem[];
}

export default async function CartPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let cart: Cart;
  try {
    cart = (await api.getCart(cookieHeader)) as Cart;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/cart');
    }
    throw err;
  }

  return <CartView cart={cart} />;
}
