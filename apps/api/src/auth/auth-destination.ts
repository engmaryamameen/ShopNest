import { Role } from '@prisma/client';

export function authDestination(role: Role, returnTo: string): string {
  return role === Role.ADMIN || role === Role.SUPER_ADMIN ? '/admin' : returnTo;
}
