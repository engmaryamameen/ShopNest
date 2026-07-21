import { OrderStatus } from '@prisma/client';
import { Role } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * Valid order state transitions:
 *
 * PENDING   → CONFIRMED  (admin only)
 * PENDING   → CANCELLED  (customer or admin)
 * CONFIRMED → SHIPPED    (admin only)
 * CONFIRMED → CANCELLED  (admin only)
 * SHIPPED   → DELIVERED  (admin only)
 * DELIVERED → (terminal — no transitions)
 * CANCELLED → (terminal — no transitions)
 */

const ADMIN_ONLY_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const CUSTOMER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [],
  [OrderStatus.SHIPPED]: [],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function assertValidTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: Role,
): void {
  const allowed =
    role === Role.ADMIN
      ? [...(ADMIN_ONLY_TRANSITIONS[from] ?? []), ...(CUSTOMER_TRANSITIONS[from] ?? [])]
      : CUSTOMER_TRANSITIONS[from] ?? [];

  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Transition from ${from} to ${to} is not allowed for role ${role}`,
    );
  }
}

export const INVENTORY_RESTORED_ON_CANCEL = true; // documents intent; checked in service
