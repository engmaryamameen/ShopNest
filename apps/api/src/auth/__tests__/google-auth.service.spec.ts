import { JwtService } from '@nestjs/jwt';
import { GoogleAuthService, safeReturnTo } from '../google-auth.service';

const getToken = jest.fn();
const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({
  generateAuthUrl: (options: Record<string, string>) => `https://accounts.google.com/?${new URLSearchParams(options)}`,
  getToken: (...args: unknown[]) => getToken(...args),
  verifyIdToken: (...args: unknown[]) => verifyIdToken(...args),
})) }));

describe('Google sign-in', () => {
  const config = { get: (key: string) => ({ 'app.googleClientId': 'client', 'app.googleClientSecret': 'secret', 'app.googleCallbackUrl': 'http://localhost:3001/auth/google/callback', 'app.nodeEnv': 'test' } as Record<string, string>)[key] };
  const jwt = new JwtService({ secret: 'test-secret' });
  const prisma = { googleIdentity: { findUnique: jest.fn(), create: jest.fn() }, user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }, refreshTokenFamily: { updateMany: jest.fn() }, passwordResetToken: { updateMany: jest.fn() }, emailVerificationToken: { updateMany: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn() };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  const service = new GoogleAuthService(config as never, jwt, prisma as never);
  beforeEach(() => { getToken.mockReset(); verifyIdToken.mockReset(); prisma.googleIdentity.findUnique.mockReset(); prisma.googleIdentity.create.mockReset(); prisma.user.findUnique.mockReset(); prisma.user.create.mockReset(); });

  it('uses a signed, short-lived state with PKCE and restricts return paths', () => {
    const flow = service.begin('//evil.example');
    const params = new URL(flow.url).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('state')).toBeTruthy();
    expect(jwt.verify(flow.cookie).returnTo).toBe('/shop');
    expect(safeReturnTo('/orders?status=open')).toBe('/orders?status=open');
    expect(safeReturnTo('/\\evil.example')).toBe('/shop');
  });

  it('rejects invalid state before contacting Google', async () => {
    const flow = service.begin('/shop');
    await expect(service.complete(flow.cookie, 'wrong', 'code')).rejects.toThrow();
    expect(getToken).not.toHaveBeenCalled();
    await expect(service.complete('invalid', 'state', 'code')).rejects.toThrow();
  });

  it('requires an authenticated confirmation before linking an existing account', async () => {
    const flow = service.begin('/orders');
    const claims = jwt.verify(flow.cookie);
    getToken.mockResolvedValue({ tokens: { id_token: 'token' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'google-id', email: 'existing@example.test', email_verified: true, nonce: claims.nonce }) });
    prisma.googleIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'existing', status: 'ACTIVE' });
    const result = await service.complete(flow.cookie, claims.state, 'code');
    expect(result.kind).toBe('link');
    if (result.kind !== 'link') throw new Error('Expected linking request');
    expect(prisma.googleIdentity.create).not.toHaveBeenCalled();
    await expect(service.link(result.proof, 'other-user')).rejects.toThrow();
    prisma.googleIdentity.create.mockResolvedValue({ subject: 'google-id', userId: 'existing' });
    await expect(service.link(result.proof, 'existing')).resolves.toBe('/orders');
    expect(prisma.googleIdentity.create).toHaveBeenCalledWith({ data: { subject: 'google-id', userId: 'existing' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'google-id', email: 'existing@example.test', email_verified: false, nonce: claims.nonce }) });
    await expect(service.complete(flow.cookie, claims.state, 'code')).rejects.toThrow();
  });

  it('accepts an active linked account but rejects a suspended one', async () => {
    const flow = service.begin('/orders'); const claims = jwt.verify(flow.cookie);
    getToken.mockResolvedValue({ tokens: { id_token: 'token' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'google-id', email: 'person@example.test', email_verified: true, nonce: claims.nonce }) });
    prisma.googleIdentity.findUnique.mockResolvedValue({ user: { id: 'user', status: 'ACTIVE' } });
    await expect(service.complete(flow.cookie, claims.state, 'code')).resolves.toEqual({ kind: 'signed-in', userId: 'user', returnTo: '/orders' });
    prisma.googleIdentity.findUnique.mockResolvedValue({ user: { id: 'user', status: 'SUSPENDED' } });
    await expect(service.complete(flow.cookie, claims.state, 'code')).rejects.toThrow('not active');
  });
  it('creates a verified customer and cart for a new Google identity', async () => {
    const flow = service.begin('/shop'); const claims = jwt.verify(flow.cookie);
    getToken.mockResolvedValue({ tokens: { id_token: 'token' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'new-google-id', email: 'New@Example.test', email_verified: true, nonce: claims.nonce, name: 'New Customer' }) });
    prisma.googleIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new-user' });
    await expect(service.complete(flow.cookie, claims.state, 'code')).resolves.toEqual({ kind: 'signed-in', userId: 'new-user', returnTo: '/shop' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'new@example.test', emailVerifiedAt: expect.any(Date), cart: { create: {} }, googleIdentity: { create: { subject: 'new-google-id' } } }) }));
  });

  it('rejects a mismatched nonce', async () => {
    const flow = service.begin('/shop'); const claims = jwt.verify(flow.cookie);
    getToken.mockResolvedValue({ tokens: { id_token: 'token' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'id', email: 'person@example.test', email_verified: true, nonce: 'wrong' }) });
    await expect(service.complete(flow.cookie, claims.state, 'code')).rejects.toThrow();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an expired or missing account-link request', async () => {
    const expired = jwt.sign({ kind: 'google-link', subject: 'google-id', userId: 'user', returnTo: '/shop' }, { expiresIn: -1 });
    await expect(service.link(expired, 'user')).rejects.toThrow('expired');
    await expect(service.link(undefined, 'user')).rejects.toThrow('expired');
    expect(prisma.googleIdentity.create).not.toHaveBeenCalled();
  });

  it('does not move an identity from another account', async () => {
    const proof = jwt.sign({ kind: 'google-link', subject: 'google-id', userId: 'user', returnTo: '/shop' }, { expiresIn: '10m' });
    prisma.googleIdentity.findUnique.mockResolvedValue({ subject: 'google-id', userId: 'someone-else' });
    await expect(service.link(proof, 'user')).rejects.toThrow('already linked');
    expect(prisma.googleIdentity.create).not.toHaveBeenCalled();
  });

  it('links a verified Google-authoritative account only after confirmation', async () => {
    const proof = jwt.sign({ kind: 'google-link', subject: 'google-id', userId: 'user', email: 'person@gmail.com', direct: true, returnTo: '/orders' }, { expiresIn: '10m' });
    prisma.$queryRaw.mockResolvedValue([{ id: 'user', email: 'person@gmail.com', status: 'ACTIVE', emailVerifiedAt: new Date() }]);
    prisma.googleIdentity.create.mockResolvedValue({ subject: 'google-id', userId: 'user' });
    await expect(service.confirmDirectLink(proof)).resolves.toEqual({ kind: 'linked', userId: 'user', returnTo: '/orders' });
    expect(prisma.googleIdentity.create).toHaveBeenCalledWith({ data: { subject: 'google-id', userId: 'user' } });
    prisma.googleIdentity.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.confirmDirectLink(proof)).rejects.toThrow('already linked');
  });

  it('requires existing credentials when Google is not authoritative', async () => {
    const proof = jwt.sign({ kind: 'google-link', subject: 'google-id', userId: 'user', email: 'person@example.com', direct: false }, { expiresIn: '10m' });
    await expect(service.confirmDirectLink(proof)).resolves.toEqual({ kind: 'requires-signin' });
    expect(prisma.googleIdentity.create).not.toHaveBeenCalled();
  });

});
