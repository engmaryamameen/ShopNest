import { OptionalJwtAuthGuard } from '../optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the authenticated user when validation succeeded', () => {
    const user = { sub: 'user-1', role: 'CUSTOMER' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns false (anonymous) when no token was present — not an error', () => {
    expect(guard.handleRequest(null, false)).toBe(false);
  });

  // The scenario item 6 asked to be locked down: if JwtAccessStrategy's
  // live DB lookup fails (a real outage, not "no token" or "bad token"),
  // Passport calls handleRequest with `err` set and `user` unset —
  // this must NOT be turned into an authenticated request by falling back
  // to anything derived from the raw, unverified-against-the-DB token
  // claims. It must fail closed: the request proceeds unauthenticated
  // (request.user stays undefined), exactly like "no token at all" — never
  // silently authenticated with stale/unchecked privileges.
  it('fails closed on a database error during validation — does not fabricate or fall back to a user', () => {
    const dbError = new Error('connection to database failed');
    const result = guard.handleRequest(dbError, undefined);
    expect(result).toBeUndefined();
  });

  it('never throws, regardless of what validate() reported — that is the entire point of "optional"', () => {
    expect(() => guard.handleRequest(new Error('any failure'), undefined)).not.toThrow();
  });
});
