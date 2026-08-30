import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../roles.guard';

function makeContext(user?: { role: Role }): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request through when the route has no @Roles() metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ role: Role.CUSTOMER }))).toBe(true);
  });

  it('allows the request through when @Roles() is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext({ role: Role.CUSTOMER }))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(makeContext({ role: Role.ADMIN }))).toBe(true);
  });

  it('denies a user whose role is not in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(makeContext({ role: Role.CUSTOMER }))).toBe(false);
  });

  it('denies an unauthenticated request (no user on the request at all) for a protected route', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  describe('SUPER_ADMIN hierarchy', () => {
    it('lets a SUPER_ADMIN through a plain @Roles(ADMIN) route', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
      expect(guard.canActivate(makeContext({ role: Role.SUPER_ADMIN }))).toBe(true);
    });

    it('does NOT let a plain ADMIN through a @Roles(SUPER_ADMIN)-only route — the hierarchy is one-way', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.SUPER_ADMIN]);
      expect(guard.canActivate(makeContext({ role: Role.ADMIN }))).toBe(false);
    });

    it('still denies a CUSTOMER on an ADMIN route — the hierarchy only elevates SUPER_ADMIN, not everyone', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
      expect(guard.canActivate(makeContext({ role: Role.CUSTOMER }))).toBe(false);
    });

    // The hierarchy is scoped to exactly one relationship: SUPER_ADMIN
    // satisfies a plain ADMIN requirement. It must not become a general
    // "SUPER_ADMIN passes everything" rule — a route gated on a
    // *different* role (VENDOR-only vendor-app routes are the real
    // example: @Roles(Role.VENDOR) on VendorOffersController etc.) has
    // nothing to do with the admin hierarchy and must keep denying a
    // SUPER_ADMIN exactly like it denies anyone else without that role.
    // Vendor-scoped ownership itself (which vendor a caller may act for)
    // is a separate mechanism entirely (VendorMembershipService, resolved
    // from VendorMember rows) that RolesGuard never touches — this test
    // guards the boundary between the two: role-gate vs. ownership-gate.
    it('does NOT let SUPER_ADMIN through a route gated on an unrelated role (e.g. VENDOR) — the hierarchy only covers ADMIN', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.VENDOR]);
      expect(guard.canActivate(makeContext({ role: Role.SUPER_ADMIN }))).toBe(false);
    });

    it('a plain ADMIN is likewise denied a VENDOR-only route — ADMIN carries no implicit vendor access either', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.VENDOR]);
      expect(guard.canActivate(makeContext({ role: Role.ADMIN }))).toBe(false);
    });

    it('explicitly listing both ADMIN and SUPER_ADMIN on a route works identically to the implicit hierarchy — the hierarchy is additive, not a replacement for correct @Roles() usage', () => {
      reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.SUPER_ADMIN]);
      expect(guard.canActivate(makeContext({ role: Role.ADMIN }))).toBe(true);
      expect(guard.canActivate(makeContext({ role: Role.SUPER_ADMIN }))).toBe(true);
      expect(guard.canActivate(makeContext({ role: Role.CUSTOMER }))).toBe(false);
    });
  });
});
