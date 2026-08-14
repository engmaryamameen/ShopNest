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
  });
});
