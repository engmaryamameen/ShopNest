import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { SignupService } from '../src/auth/signup.service';

const enabled = process.env.SHOPNEST_DISPOSABLE_DB === 'true' && /\/shopnest_signup_test_[a-zA-Z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL ?? '');
(enabled ? describe : describe.skip)('signup verification', () => {
  const prisma = new PrismaClient();
  const captured: string[] = [];
  const mail = { sendSignupCode: jest.fn(async (_email: string, code: string) => { captured.push(code); }) };
  const config = { getOrThrow: () => 'test-secret-at-least-32-characters-long' };
  const service = new SignupService(prisma as unknown as PrismaService, config as unknown as ConfigService, mail as unknown as MailService);
  const email = `signup-${Date.now()}@example.test`;
  let challenge: string;

  afterAll(async () => { await prisma.$disconnect(); });

  it('keeps registration pending and creates a verified account only once', async () => {
    challenge = await service.begin({ email, fullName: 'Alex Morgan', password: 'TestPassword123!' });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    const pending = await prisma.pendingSignup.findUniqueOrThrow({ where: { email } });
    expect(pending.passwordHash).not.toBe('TestPassword123!');
    expect(await argon2.verify(pending.passwordHash, 'TestPassword123!')).toBe(true);
    expect(pending.codeHash).not.toContain(captured[0]);
    await expect(service.verify('another-browser', captured[0])).rejects.toThrow('start signup');
    const userId = await service.verify(challenge, captured[0]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { cart: true } });
    expect(user.fullName).toBe('Alex Morgan');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.cart).not.toBeNull();
    await expect(service.verify(challenge, captured[0])).rejects.toThrow('start signup');
  });

  it('limits guesses, enforces resend cooldown and expires codes', async () => {
    const nextEmail = `attempts-${Date.now()}@example.test`;
    const token = await service.begin({ email: nextEmail, password: 'TestPassword123!' });
    const code = captured[captured.length - 1];
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) await expect(service.verify(token, wrong)).rejects.toThrow('not correct');
    await expect(service.verify(token, code)).rejects.toThrow('Too many attempts');
    await expect(service.resend(token)).rejects.toThrow('wait a minute');
    await prisma.pendingSignup.update({ where: { email: nextEmail }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    await service.resend(token);
    const replacement = captured[captured.length - 1];
    await prisma.pendingSignup.update({ where: { email: nextEmail }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(service.verify(token, replacement)).rejects.toThrow('expired');
    expect(await prisma.user.findUnique({ where: { email: nextEmail } })).toBeNull();
  });

  it('allows only one of two simultaneous submissions', async () => {
    const nextEmail = `race-${Date.now()}@example.test`;
    const token = await service.begin({ email: nextEmail, password: 'TestPassword123!' });
    const code = captured[captured.length - 1];
    const outcomes = await Promise.allSettled([service.verify(token, code), service.verify(token, code)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: nextEmail } })).toBe(1);
  });

  it('does not leave a pending signup when delivery fails', async () => {
    const nextEmail = `mail-failure-${Date.now()}@example.test`;
    mail.sendSignupCode.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await expect(service.begin({ email: nextEmail, password: 'TestPassword123!' })).rejects.toThrow('could not send');
    expect(await prisma.pendingSignup.findUnique({ where: { email: nextEmail } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: nextEmail } })).toBeNull();
  });
});
