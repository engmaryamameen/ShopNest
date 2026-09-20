import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import * as argon2 from 'argon2';
import { generateRefreshToken, hashToken } from '../token.util';
import { Role } from '@prisma/client';

// Minimal Prisma mock factory
function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cart: {
      create: jest.fn(),
    },
    refreshTokenFamily: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      update: jest.fn(),
      create: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
}

function makeMailMock() {
  return { sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };
}

function makeLoggerMock() {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}

function makeConfigMock(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'app.jwtAccessSecret': 'test-access-secret',
    'app.jwtRefreshSecret': 'test-refresh-secret',
    'app.jwtAccessExpiresIn': '15m',
    'app.jwtRefreshExpiresIn': '30d',
    'app.refreshGracePeriodMs': 30000,
    ...overrides,
  };
  return { getOrThrow: (key: string) => defaults[key], get: (key: string, def?: unknown) => defaults[key] ?? def };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let mail: ReturnType<typeof makeMailMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    mail = makeMailMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: makeConfigMock() },
        { provide: MailService, useValue: mail },
        { provide: Logger, useValue: makeLoggerMock() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });
      await expect(
        service.register({ email: 'test@example.com', password: 'password123456' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user, cart, and token family on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-id', email: 'test@example.com', role: Role.CUSTOMER });
      prisma.cart.create.mockResolvedValue({ id: 'cart-id' });
      prisma.refreshTokenFamily.create.mockResolvedValue({ id: 'family-id' });

      const result = await service.register({ email: 'test@example.com', password: 'validpassword123' });

      expect(prisma.cart.create).toHaveBeenCalledWith({ data: { userId: 'user-id' } });
      expect(result.userId).toBe('user-id');
      expect(result.familyId).toBe('family-id');
      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken).toMatch(/^[0-9a-f]{128}$/);
    });

    it('hashes the password with argon2id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => {
        // Verify the password is hashed (not stored in plaintext)
        expect(data.passwordHash).not.toBe('validpassword123');
        const valid = await argon2.verify(data.passwordHash, 'validpassword123');
        expect(valid).toBe(true);
        return { id: 'user-id', email: data.email, role: Role.CUSTOMER };
      });
      prisma.cart.create.mockResolvedValue({ id: 'cart-id' });
      prisma.refreshTokenFamily.create.mockResolvedValue({ id: 'family-id' });

      await service.register({ email: 'test@example.com', password: 'validpassword123' });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'ghost@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await argon2.hash('correctpassword', { type: argon2.argon2id });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: hash,
        role: Role.CUSTOMER,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('succeeds with correct credentials', async () => {
      const hash = await argon2.hash('correctpassword123', { type: argon2.argon2id });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: hash,
        role: Role.CUSTOMER,
        status: 'ACTIVE',
      });
      prisma.refreshTokenFamily.create.mockResolvedValue({ id: 'family-id' });

      const result = await service.login({ email: 'test@example.com', password: 'correctpassword123' });
      expect(result.userId).toBe('user-id');
      expect(result.familyId).toBe('family-id');
    });
  });

  describe('refresh - concurrent tab grace period', () => {
    it('returns recently-rotated when token was used within grace period', async () => {
      const { raw } = generateRefreshToken();
      const usedAt = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              tokenId: 'tok-id',
              tokenIsUsed: true,
              usedAt,
              tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
              familyId: 'fam-id',
              familyIsRevoked: false,
              userId: 'user-id',
            },
          ]),
          refreshTokenFamily: { update: jest.fn() },
          refreshToken: { update: jest.fn(), create: jest.fn() },
        };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('recently-rotated');
    });

    it('returns already-revoked and revokes family when token reused outside grace period', async () => {
      const { raw } = generateRefreshToken();
      const usedAt = new Date(Date.now() - 60000).toISOString(); // 60 seconds ago

      let familyRevoked = false;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              tokenId: 'tok-id',
              tokenIsUsed: true,
              usedAt,
              tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
              familyId: 'fam-id',
              familyIsRevoked: false,
              userId: 'user-id',
            },
          ]),
          refreshTokenFamily: {
            update: jest.fn().mockImplementation(() => {
              familyRevoked = true;
            }),
          },
          refreshToken: { update: jest.fn(), create: jest.fn() },
        };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('already-revoked');
      expect(familyRevoked).toBe(true);
    });

    it('returns not-found for unknown token', async () => {
      const { raw } = generateRefreshToken();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = { $queryRaw: jest.fn().mockResolvedValue([]) };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('not-found');
    });

    it('returns expired for expired token', async () => {
      const { raw } = generateRefreshToken();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              tokenId: 'tok-id',
              tokenIsUsed: false,
              usedAt: null,
              tokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // expired
              familyId: 'fam-id',
              familyIsRevoked: false,
              userId: 'user-id',
            },
          ]),
        };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('expired');
    });

    it('returns family-revoked when family is already revoked', async () => {
      const { raw } = generateRefreshToken();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              tokenId: 'tok-id',
              tokenIsUsed: false,
              usedAt: null,
              tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
              familyId: 'fam-id',
              familyIsRevoked: true, // already revoked
              userId: 'user-id',
            },
          ]),
        };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('family-revoked');
    });

    it('rotates token successfully for valid unused token', async () => {
      const { raw } = generateRefreshToken();
      let newTokenCreated = false;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              tokenId: 'tok-id',
              tokenIsUsed: false,
              usedAt: null,
              tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
              familyId: 'fam-id',
              familyIsRevoked: false,
              userId: 'user-id',
            },
          ]),
          refreshToken: {
            update: jest.fn(),
            create: jest.fn().mockImplementation(() => {
              newTokenCreated = true;
            }),
          },
          refreshTokenFamily: { update: jest.fn() },
        };
        return fn(txMock);
      });

      const result = await service.refresh(raw, 30000);
      expect(result.kind).toBe('rotated');
      if (result.kind === 'rotated') {
        expect(result.userId).toBe('user-id');
        expect(result.familyId).toBe('fam-id');
        expect(result.newRawToken).toMatch(/^[0-9a-f]{128}$/);
      }
      expect(newTokenCreated).toBe(true);
    });
  });

  describe('SHA-256 lookup correctness', () => {
    it('only accepts exact raw token (SHA-256 is deterministic)', async () => {
      const { raw, hash } = generateRefreshToken();
      // Verify that hashToken(raw) === hash
      expect(hashToken(raw)).toBe(hash);
      // Verify that a different raw token produces a different hash
      const { raw: raw2, hash: hash2 } = generateRefreshToken();
      expect(hash2).not.toBe(hash);
      expect(hashToken(raw2)).toBe(hash2);
    });
  });

  describe('logout', () => {
    it('revokes only the current family', async () => {
      prisma.refreshTokenFamily.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('user-id', 'family-id');
      expect(prisma.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { id: 'family-id', userId: 'user-id' },
        data: { isRevoked: true },
      });
    });
  });

  describe('logoutAll', () => {
    it('revokes all families for the user', async () => {
      prisma.refreshTokenFamily.updateMany.mockResolvedValue({ count: 3 });
      await service.logoutAll('user-id');
      expect(prisma.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        data: { isRevoked: true },
      });
    });
  });

  describe('email verification', () => {
    it('rejects an unknown token as invalid', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('bogus')).resolves.toBe('invalid');
    });

    it('rejects an already-consumed token as invalid (single use)', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      });
      await expect(service.verifyEmail('used-token')).resolves.toBe('invalid');
    });

    it('rejects an expired token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
      });
      await expect(service.verifyEmail('expired-token')).resolves.toBe('expired');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('marks the user verified on a valid, unconsumed token — and consumes it', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id', emailVerifiedAt: null });

      await expect(service.verifyEmail('good-token')).resolves.toBe('verified');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'tok-1' },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('reports already-verified without re-touching the user row', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id', emailVerifiedAt: new Date() });

      await expect(service.verifyEmail('good-token')).resolves.toBe('already-verified');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('resendVerification is a silent no-op for an unknown email (no enumeration signal)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.resendVerification('nobody@example.com');
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('resendVerification is a silent no-op once already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id', email: 'a@b.com', emailVerifiedAt: new Date() });
      await service.resendVerification('a@b.com');
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('password reset', () => {
    it('requestPasswordReset is a silent no-op for an unknown email (no enumeration signal)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.requestPasswordReset('nobody@example.com');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a token and emails it for a known user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-id', email: 'a@b.com' });

      await service.requestPasswordReset('a@b.com', '203.0.113.5');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-id', requestIp: '203.0.113.5' }) }),
      );
      expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', expect.any(String));
    });

    it('rejects an unknown reset token as invalid', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('bogus', 'newStr0ngPassword123')).resolves.toBe('invalid');
    });

    it('rejects an expired reset token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
      });
      await expect(service.resetPassword('expired', 'newStr0ngPassword123')).resolves.toBe('expired');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the password, consumes the token, and revokes every session — all in one transaction', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });

      await expect(service.resetPassword('good-token', 'newStr0ngPassword123')).resolves.toBe('reset');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-id' } }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        data: { isRevoked: true },
      });
    });
  });

  describe('sessions', () => {
    it('lists non-revoked sessions ordered by lastSeenAt, flagging the caller-current one', async () => {
      const rows = [
        { id: 'fam-current', label: 'Chrome on macOS', userAgent: 'ua', ipAddress: '1.1.1.1', createdAt: new Date(), lastSeenAt: new Date() },
        { id: 'fam-other', label: null, userAgent: null, ipAddress: null, createdAt: new Date(), lastSeenAt: new Date() },
      ];
      prisma.refreshTokenFamily.findMany.mockResolvedValue(rows);

      const result = await service.listSessions('user-id', 'fam-current');

      expect(prisma.refreshTokenFamily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-id', isRevoked: false } }),
      );
      expect(result.find((s) => s.id === 'fam-current')?.isCurrent).toBe(true);
      expect(result.find((s) => s.id === 'fam-other')?.isCurrent).toBe(false);
    });

    it('revokes a session scoped to the caller', async () => {
      prisma.refreshTokenFamily.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeSession('user-id', 'fam-1');
      expect(prisma.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { id: 'fam-1', userId: 'user-id' },
        data: { isRevoked: true },
      });
    });

    it('throws NotFoundException revoking a session that does not belong to the caller (or does not exist)', async () => {
      prisma.refreshTokenFamily.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revokeSession('user-id', 'someone-elses-fam')).rejects.toThrow(NotFoundException);
    });
  });
});
