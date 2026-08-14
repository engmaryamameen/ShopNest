'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Cart, CartItem } from './api-types';

export type { Cart, CartItem } from './api-types';

export const CART_QUERY_KEY = ['cart'] as const;

export function useCart(enabled = true) {
  return useQuery<Cart | null>({
    queryKey: CART_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.getCart();
      } catch {
        // 401 = not logged in; treat as empty cart rather than an error.
        return null;
      }
    },
    staleTime: 30_000,
    enabled,
  });
}

export function useCartCount(enabled = true): number {
  const { data } = useCart(enabled);
  return data?.items?.length ?? 0;
}

export function useUpsertCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vendorOfferId, quantity }: { vendorOfferId: string; quantity: number }) =>
      api.upsertCartItem({ vendorOfferId, quantity }),

    onMutate: async ({ vendorOfferId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart | null>(CART_QUERY_KEY);

      queryClient.setQueryData<Cart | null>(CART_QUERY_KEY, (old) => {
        if (!old) return old;
        const exists = old.items.find((i) => i.vendorOfferId === vendorOfferId);
        if (exists) {
          return {
            ...old,
            items: old.items.map((i) => (i.vendorOfferId === vendorOfferId ? { ...i, quantity } : i)),
          };
        }
        // A brand-new line can't be rendered correctly without its
        // vendor/product/price data (which this mutation doesn't return —
        // see api.ts's CartItemFromUpsert doc) — onSettled's refetch below
        // fills it in moments later; skip the optimistic insert rather
        // than render a placeholder with fabricated values.
        return old;
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

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vendorOfferId: string) => api.removeCartItem(vendorOfferId),

    onMutate: async (vendorOfferId) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart | null>(CART_QUERY_KEY);

      queryClient.setQueryData<Cart | null>(CART_QUERY_KEY, (old) =>
        old ? { ...old, items: old.items.filter((i: CartItem) => i.vendorOfferId !== vendorOfferId) } : old,
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
