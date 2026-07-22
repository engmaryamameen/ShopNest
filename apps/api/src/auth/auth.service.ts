import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateRefreshToken, hashToken } from './token.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';

type RefreshOutcome =
  | { kind: 'not-found' }
  | { kind: 'already-revoked' }
  | { kind: 'expired' }
  | { kind: 'recently-rotated'; gracePeriodMs: number }
  | { kind: 'family-revoked' }
  | { kind: 'rotated'; userId: string; familyId: string; newRawToken: string };

interface LockedRecord {
  tokenId: string;
  tokenIsUsed: boolean;
  usedAt: string | null;
  tokenExpiresAt: string;
  familyId: string;
  familyIsRevoked: boolean;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string; familyId: string; rawToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    // Hash outside the transaction — argon2 is intentionally slow and holding
    // a connection for its duration would unnecessarily starve the pool.
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    // User and cart are created atomically so the system can never have a user
    // without a cart (which would cause checkout to fail with "Cart not found").
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: dto.email, passwordHash } });
      await tx.cart.create({ data: { userId: u.id } });
      return u;
    });

    const { familyId, rawToken } = await this.createTokenFamily(user.id);
    return { userId: user.id, familyId, rawToken };
  }

  async login(dto: LoginDto): Promise<{ userId: string; role: Role; familyId: string; rawToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Constant-time comparison even when user is not found (dummy hash comparison)
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$dummydummydummydummydummydummy';
    const hash = user?.passwordHash ?? dummyHash;
    const valid = await argon2.verify(hash, dto.password);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { familyId, rawToken } = await this.createTokenFamily(user.id);
    return { userId: user.id, role: user.role, familyId, rawToken };
  }

  async refresh(rawToken: string, gracePeriodMs: number): Promise<RefreshOutcome> {
    const tokenHash = hashToken(rawToken);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRecord[]>`
        SELECT
          rt.id             AS "tokenId",
          rt."isUsed"       AS "tokenIsUsed",
          rt."usedAt"       AS "usedAt",
          rt."expiresAt"    AS "tokenExpiresAt",
          rtf.id            AS "familyId",
          rtf."isRevoked"   AS "familyIsRevoked",
          rtf."userId"      AS "userId"
        FROM   "RefreshToken"       rt
        JOIN   "RefreshTokenFamily" rtf ON rtf.id = rt."familyId"
        WHERE  rt."tokenHash" = ${tokenHash}
        FOR UPDATE
      `;

      if (rows.length === 0) return { kind: 'not-found' } as RefreshOutcome;

      const rec = rows[0];

      if (rec.familyIsRevoked) {
        return { kind: 'family-revoked' } as RefreshOutcome;
      }

      if (new Date(rec.tokenExpiresAt) < new Date()) {
        return { kind: 'expired' } as RefreshOutcome;
      }

      if (rec.tokenIsUsed) {
        // Grace period: allow a brief window for concurrent refresh from multiple tabs
        if (rec.usedAt) {
          const elapsed = Date.now() - new Date(rec.usedAt).getTime();
          if (elapsed <= gracePeriodMs) {
            return { kind: 'recently-rotated', gracePeriodMs } as RefreshOutcome;
          }
        }
        // Token reuse outside grace period — revoke the entire family (theft signal)
        await tx.refreshTokenFamily.update({
          where: { id: rec.familyId },
          data: { isRevoked: true },
        });
        return { kind: 'already-revoked' } as RefreshOutcome;
      }

      await tx.refreshToken.update({
        where: { id: rec.tokenId },
        data: { isUsed: true, usedAt: new Date() },
      });

      const expiresIn = this.config.getOrThrow<string>('app.jwtRefreshExpiresIn');
      const { raw: newRawToken, hash: newHash } = generateRefreshToken();
      const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));

      await tx.refreshToken.create({
        data: {
          familyId: rec.familyId,
          tokenHash: newHash,
          expiresAt,
        },
      });

      return {
        kind: 'rotated',
        userId: rec.userId,
        familyId: rec.familyId,
        newRawToken,
      } as RefreshOutcome;
    });

    return outcome;
  }

  async logout(userId: string, familyId: string): Promise<void> {
    // Revoke just the current family (single-device logout)
    await this.prisma.refreshTokenFamily.updateMany({
      where: { id: familyId, userId },
      data: { isRevoked: true },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    // Revoke all families for this user (all-device logout)
    await this.prisma.refreshTokenFamily.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  signAccessToken(payload: { sub: string; email: string; role: Role; familyId: string }): string {
    return this.jwtService.sign(
      { sub: payload.sub, email: payload.email, role: payload.role, familyId: payload.familyId },
      { expiresIn: this.config.getOrThrow<string>('app.jwtAccessExpiresIn') },
    );
  }

  async getUserById(userId: string): Promise<{ id: string; email: string; role: Role } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
  }

  private async createTokenFamily(
    userId: string,
  ): Promise<{ familyId: string; rawToken: string }> {
    const expiresIn = this.config.getOrThrow<string>('app.jwtRefreshExpiresIn');
    const { raw, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));

    const family = await this.prisma.refreshTokenFamily.create({
      data: {
        userId,
        tokens: {
          create: { tokenHash: hash, expiresAt },
        },
      },
    });

    return { familyId: family.id, rawToken: raw };
  }
}

function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration string: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 1000);
}

export type { JwtPayload, RefreshOutcome };
