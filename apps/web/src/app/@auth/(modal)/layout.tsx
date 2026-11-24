import type { ReactNode } from 'react';
import { AuthModal } from '@/components/auth/auth-modal';

export default function AuthModalLayout({ children }: { children: ReactNode }) {
  return <AuthModal>{children}</AuthModal>;
}
