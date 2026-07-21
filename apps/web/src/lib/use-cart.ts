'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface CartProduct {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl?: string | null;
  stockQuantity: number;
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  product: CartProduct;
}

export interface Cart {
  id: string;
  items: CartItem[];
}

export const CART_QUERY_KEY = ['cart'] as const;

/** Fetch the current user's cart (no-op when unauthenticated — returns null). */
export function useCart() {
  return useQuery<Cart | null>({
    queryKey: CART_QUERY_KEY,
    queryFn: async () => {
      try {
        return (await api.getCart()) as Cart;
      } catch {
        // 401 = not logged in; treat as empty cart rather than an error.
        return null;
      }
    },
    staleTime: 30_000,
  });
}

/** Total number of distinct line items in the cart (for the nav badge). */
export function useCartCount(): number {
  const { data } = useCart();
  return data?.items?.length ?? 0;
}

/**
 * Add or update a cart item with optimistic UI.
 * On error the previous cache snapshot is restored automatically.
 */
export function useUpsertCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api.upsertCartItem({ productId, quantity }),

    onMutate: async ({ productId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart | null>(CART_QUERY_KEY);

      queryClient.setQueryData<Cart | null>(CART_QUERY_KEY, (old) => {
        if (!old) return old;
        const exists = old.items.find((i) => i.productId === productId);
        return {
          ...old,
          items: exists
            ? old.items.map((i) => (i.productId === productId ? { ...i, quantity } : i))
            : [
                ...old.items,
                {
                  id: `optimistic-${productId}`,
                  productId,
                  quantity,
                  // exists is undefined in this branch; placeholder product for optimistic render
                  product: { id: productId } as CartProduct,
                },
              ],
        };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(CART_QUERY_KEY, context.previous);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY }),
  });
}

/**
 * Remove a cart item by productId with optimistic UI.
 * On error the previous cache snapshot is restored automatically.
 */
export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => api.removeCartItem(productId),

    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart | null>(CART_QUERY_KEY);

      queryClient.setQueryData<Cart | null>(CART_QUERY_KEY, (old) =>
        old ? { ...old, items: old.items.filter((i) => i.productId !== productId) } : old,
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(CART_QUERY_KEY, context.previous);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY }),
  });
}
