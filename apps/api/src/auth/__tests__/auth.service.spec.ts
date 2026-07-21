import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';
import { generateRefreshToken, hashToken } from '../token.util';
import { Role } from '@prisma/client';

// Minimal Prisma mock factory
function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    cart: {
      create: jest.fn(),
    },
    refreshTokenFamily: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
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

  beforeEach(async () => {
    prisma = makePrismaMock();
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: makeConfigMock() },
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
      });
      prisma.refreshTokenFamily.create.mockResolvedValue({ id: 'family-id' });

      const result = await service.login({ email: 'test@example.com', password: 'correctpassword123' });
      expect(result.userId).toBe('user-id');
      expect(result.familyId).toBe('family-id');
    });
  });

  describe('refresh - concurrent tab grace period', () => {
    it('returns recently-rotated when token was used within grace period', async () => {
      const { raw, hash } = generateRefreshToken();
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
});
