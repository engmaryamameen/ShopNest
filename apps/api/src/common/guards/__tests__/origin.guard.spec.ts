import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { OriginGuard } from '../origin.guard';

function makeContext(method: string, origin?: string): ExecutionContext {
  const request = {
    method,
    headers: origin !== undefined ? { origin } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let config: { get: jest.Mock };
  let guard: OriginGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    config = { get: jest.fn().mockReturnValue('https://shopnest.example') };
    guard = new OriginGuard(reflector as unknown as Reflector, config as unknown as ConfigService);
  });

  it('allows safe methods (GET/HEAD/OPTIONS) without checking Origin at all', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(guard.canActivate(makeContext(method))).toBe(true);
    }
  });

  it('allows any route flagged with @SkipOriginCheck(), regardless of method or Origin', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(makeContext('POST', 'https://evil.example'))).toBe(true);
  });

  it('rejects a mutating request with a missing Origin header', () => {
    expect(() => guard.canActivate(makeContext('POST'))).toThrow(ForbiddenException);
  });

  it('rejects a mutating request whose Origin does not match WEB_URL', () => {
    expect(() => guard.canActivate(makeContext('DELETE', 'https://evil.example'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a mutating request whose Origin exactly matches WEB_URL', () => {
    expect(guard.canActivate(makeContext('POST', 'https://shopnest.example'))).toBe(true);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('enforces the Origin check for %s requests too', (method) => {
    expect(() => guard.canActivate(makeContext(method, 'https://evil.example'))).toThrow(
      ForbiddenException,
    );
  });
});
