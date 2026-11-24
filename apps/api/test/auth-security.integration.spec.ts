import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { generateSecureToken, hashToken } from '../src/auth/token.util';

const enabled = process.env.SHOPNEST_DISPOSABLE_DB === 'true' && /\/shopnest_signup_test_[a-zA-Z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL ?? '');
(enabled ? describe : describe.skip)('authentication persistence and recovery', () => {
  const prisma = new PrismaClient();
  const config = { getOrThrow: (key: string) => key === 'app.jwtRefreshExpiresIn' ? '30d' : '15m' };
  const auth = new AuthService(prisma as never, {} as never, config as never, {} as never, {} as never);
  afterAll(async () => { await prisma.$disconnect(); });

  async function account() {
    const email = `security-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const password = 'TestPassword123!';
    const user = await prisma.user.create({ data: { email, passwordHash: await argon2.hash(password), emailVerifiedAt: new Date() } });
    const session = await auth.login({ email, password });
    return { user, password, session };
  }

  it('consumes a recovery token once and revokes existing sessions', async () => {
    const { user, session } = await account();
    const token = generateSecureToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(Date.now() + 60_000) } });
    const outcomes = await Promise.all([auth.resetPassword(token.raw, 'NewPassword123!'), auth.resetPassword(token.raw, 'OtherPassword123!')]);
    expect(outcomes.sort()).toEqual(['invalid', 'reset']);
    expect((await prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: session.familyId } })).isRevoked).toBe(true);
    await expect(auth.resetPassword(token.raw, 'ThirdPassword123!')).resolves.toBe('invalid');
    await expect(auth.login({ email: user.email, password: 'TestPassword123!' })).rejects.toThrow('Invalid credentials');
  });

  it('rejects an expired recovery token without changing the password', async () => {
    const { user, password } = await account();
    const token = generateSecureToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(Date.now() - 1) } });
    await expect(auth.resetPassword(token.raw, 'NewPassword123!')).resolves.toBe('expired');
    expect(await argon2.verify((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, password)).toBe(true);
  });

  it('reports concurrent refresh and revokes the family on replay after its grace period', async () => {
    const { session } = await account();
    const result = await auth.refresh(session.rawToken, 30_000);
    expect(result.kind).toBe('rotated');
    expect((await auth.refresh(session.rawToken, 30_000)).kind).toBe('recently-rotated');
    await prisma.refreshToken.update({ where: { tokenHash: hashToken(session.rawToken) }, data: { usedAt: new Date(Date.now() - 31_000) } });
    expect((await auth.refresh(session.rawToken, 30_000)).kind).toBe('already-revoked');
    expect((await prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: session.familyId } })).isRevoked).toBe(true);
  });
});
