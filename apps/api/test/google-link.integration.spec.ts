import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import { AuthService } from '../src/auth/auth.service';
import * as argon2 from 'argon2';

const enabled = process.env.SHOPNEST_DISPOSABLE_DB === 'true' && /\/shopnest_signup_test_[a-zA-Z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL ?? '');
(enabled ? describe : describe.skip)('Google account linking', () => {
  const prisma = new PrismaClient();
  const jwt = new JwtService({ secret: 'test-secret' });
  const service = new GoogleAuthService({ get: () => 'test' } as never, jwt, prisma as never);
  afterAll(async () => { await prisma.$disconnect(); });

  it('links once, rejects replay, and preserves the existing account', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `google-link-${suffix}@gmail.com`;
    const user = await prisma.user.create({ data: { email, passwordHash: 'existing-hash', emailVerifiedAt: new Date(), cart: { create: {} } } });
    const subject = `test-subject-${suffix}`;
    const proof = jwt.sign({ kind: 'google-link', subject, userId: user.id, email, direct: true, returnTo: '/orders' }, { expiresIn: '10m' });
    const results = await Promise.allSettled([service.confirmDirectLink(proof), service.confirmDirectLink(proof)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const linked = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { googleIdentity: true, cart: true } });
    expect(linked.passwordHash).toBe('existing-hash');
    expect(linked.googleIdentity?.subject).toBe(subject);
    expect(linked.cart).not.toBeNull();
  });
  it('secures an unverified account and invalidates old access', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `google-unverified-${suffix}@gmail.com`;
    const passwordHash = await argon2.hash('OldPassword123!');
    const user = await prisma.user.create({ data: { email, passwordHash, cart: { create: {} } } });
    const family = await prisma.refreshTokenFamily.create({ data: { userId: user.id } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: `reset-${suffix}`, expiresAt: new Date(Date.now() + 60_000) } });
    const proof = jwt.sign({ kind: 'google-link', subject: `subject-${suffix}`, userId: user.id, email, direct: true, returnTo: '/shop' }, { expiresIn: '10m' });
    await service.confirmDirectLink(proof);
    const secured = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(secured.emailVerifiedAt).not.toBeNull();
    expect(await argon2.verify(secured.passwordHash, 'OldPassword123!')).toBe(false);
    expect((await prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: family.id } })).isRevoked).toBe(true);
    expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })).consumedAt).not.toBeNull();
    const auth = new AuthService(prisma as never, jwt, { getOrThrow: () => '30d' } as never, {} as never, {} as never);
    await expect(auth.login({ email, password: 'OldPassword123!' })).rejects.toThrow('Invalid credentials');
  });

  it('revokes or rejects an old-password login that races with linking', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `google-race-${suffix}@gmail.com`;
    const password = 'OldPassword123!';
    const user = await prisma.user.create({ data: { email, passwordHash: await argon2.hash(password) } });
    const proof = jwt.sign({ kind: 'google-link', subject: `race-${suffix}`, userId: user.id, email, direct: true }, { expiresIn: '10m' });
    const auth = new AuthService(prisma as never, jwt, { getOrThrow: () => '30d' } as never, {} as never, {} as never);
    const [link, login] = await Promise.allSettled([service.confirmDirectLink(proof), auth.login({ email, password })]);
    expect(link.status).toBe('fulfilled');
    if (login.status === 'fulfilled') {
      const family = await prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: login.value.familyId } });
      expect(family.isRevoked).toBe(true);
    }
    expect(await prisma.refreshTokenFamily.count({ where: { userId: user.id, isRevoked: false } })).toBe(0);
  });

});
