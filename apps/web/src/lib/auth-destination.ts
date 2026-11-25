import { validateReturnTo } from './validate-return-to';

export function authDestination(role: string, returnTo: string | null | undefined): string {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin';
  return validateReturnTo(returnTo);
}
