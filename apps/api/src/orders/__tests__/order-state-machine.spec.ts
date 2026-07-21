import { BadRequestException } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { assertValidTransition } from '../order-state-machine';

describe('order state machine', () => {
  describe('ADMIN transitions', () => {
    it('PENDING → CONFIRMED is allowed', () => {
      expect(() => assertValidTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED, Role.ADMIN)).not.toThrow();
    });

    it('PENDING → CANCELLED is allowed', () => {
      expect(() => assertValidTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, Role.ADMIN)).not.toThrow();
    });

    it('CONFIRMED → SHIPPED is allowed', () => {
      expect(() => assertValidTransition(OrderStatus.CONFIRMED, OrderStatus.SHIPPED, Role.ADMIN)).not.toThrow();
    });

    it('CONFIRMED → CANCELLED is allowed (admin only)', () => {
      expect(() => assertValidTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED, Role.ADMIN)).not.toThrow();
    });

    it('SHIPPED → DELIVERED is allowed', () => {
      expect(() => assertValidTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED, Role.ADMIN)).not.toThrow();
    });

    it('DELIVERED is terminal — no transitions', () => {
      for (const to of Object.values(OrderStatus)) {
        if (to !== OrderStatus.DELIVERED) {
          expect(() => assertValidTransition(OrderStatus.DELIVERED, to, Role.ADMIN)).toThrow(BadRequestException);
        }
      }
    });

    it('CANCELLED is terminal — no transitions', () => {
      for (const to of Object.values(OrderStatus)) {
        if (to !== OrderStatus.CANCELLED) {
          expect(() => assertValidTransition(OrderStatus.CANCELLED, to, Role.ADMIN)).toThrow(BadRequestException);
        }
      }
    });
  });

  describe('CUSTOMER transitions', () => {
    it('PENDING → CANCELLED is allowed', () => {
      expect(() => assertValidTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, Role.CUSTOMER)).not.toThrow();
    });

    it('PENDING → CONFIRMED is NOT allowed for customer', () => {
      expect(() => assertValidTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED, Role.CUSTOMER)).toThrow(BadRequestException);
    });

    it('CONFIRMED → CANCELLED is NOT allowed for customer', () => {
      expect(() => assertValidTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED, Role.CUSTOMER)).toThrow(BadRequestException);
    });

    it('CONFIRMED → SHIPPED is NOT allowed for customer', () => {
      expect(() => assertValidTransition(OrderStatus.CONFIRMED, OrderStatus.SHIPPED, Role.CUSTOMER)).toThrow(BadRequestException);
    });

    it('SHIPPED → any transition is NOT allowed for customer', () => {
      for (const to of Object.values(OrderStatus)) {
        expect(() => assertValidTransition(OrderStatus.SHIPPED, to, Role.CUSTOMER)).toThrow(BadRequestException);
      }
    });
  });
});
