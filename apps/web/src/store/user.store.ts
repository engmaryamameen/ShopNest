'use client';

import { create } from 'zustand';

export type UserRole = 'CUSTOMER' | 'ADMIN';

export interface UserIdentity {
  id: string;
  email: string;
  role: UserRole;
}

interface UserState {
  user: UserIdentity | null;
  setUser: (user: UserIdentity | null) => void;
}

/**
 * Zustand store: holds only { id, email, role } user identity.
 * No tokens — those live exclusively in httpOnly cookies.
 * Server-owned data (products, cart, orders) is managed by TanStack Query.
 */
export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
