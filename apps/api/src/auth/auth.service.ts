import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { generateRefreshToken, generateSecureToken, hashToken } from './token.util';
import { describeUserAgent } from './session-label.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';

export type EmailVerificationOutcome = 'verified' | 'already-verified' | 'invalid' | 'expired';
export type PasswordResetOutcome = 'reset' | 'invalid' | 'expired';

export interface SessionSummary {
  id: string;
  label: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  isCurrent: boolean;
}

type DeviceContext = { userAgent?: string; ipAddress?: string };

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
    private readonly mail: MailService,
    private readonly logger: Logger,
  ) {}

  async register(
    dto: RegisterDto,
    device: DeviceContext = {},
  ): Promise<{ userId: string; familyId: string; rawToken: string }> {
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

    // Registration must succeed even if the mail provider is unreachable —
    // the account exists and is usable either way; verification can be
    // retried via resendVerification(). Never let a transient mail failure
    // turn into a failed signup.
    try {
      const token = await this.createEmailVerificationToken(user.id);
      await this.mail.sendVerificationEmail(user.email, token);
    } catch (err) {
      this.logger.error({ err, userId: user.id }, 'Failed to send verification email on register');
    }

    const { familyId, rawToken } = await this.createTokenFamily(user.id, device);
    return { userId: user.id, familyId, rawToken };
  }

  async login(
    dto: LoginDto,
    device: DeviceContext = {},
  ): Promise<{ userId: string; role: Role; familyId: string; rawToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Constant-time comparison even when user is not found (dummy hash comparison)
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$dummydummydummydummydummydummy';
    const hash = user?.passwordHash ?? dummyHash;
    const valid = await argon2.verify(hash, dto.password);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        user.status === UserStatus.SUSPENDED
          ? 'This account has been suspended. Contact support for help.'
          : 'This account has been deactivated.',
      );
    }

    const { familyId, rawToken } = await this.createTokenFamily(user.id, device);
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

      await tx.refreshTokenFamily.update({
        where: { id: rec.familyId },
        data: { lastSeenAt: new Date() },
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

  async getUserById(
    userId: string,
  ): Promise<{ id: string; email: string; role: Role; emailVerifiedAt: Date | null } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, emailVerifiedAt: true },
    });
  }

  private async createTokenFamily(
    userId: string,
    device: DeviceContext = {},
  ): Promise<{ familyId: string; rawToken: string }> {
    const expiresIn = this.config.getOrThrow<string>('app.jwtRefreshExpiresIn');
    const { raw, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));

    const family = await this.prisma.refreshTokenFamily.create({
      data: {
        userId,
        userAgent: device.userAgent ?? null,
        ipAddress: device.ipAddress ?? null,
        label: describeUserAgent(device.userAgent),
        tokens: {
          create: { tokenHash: hash, expiresAt },
        },
      },
    });

    return { familyId: family.id, rawToken: raw };
  }

  // ── Email verification ──────────────────────────────────────────────────

  async createEmailVerificationToken(userId: string): Promise<string> {
    const { raw, hash } = generateSecureToken();
    const ttlMs = this.config.get<number>('app.emailVerificationTokenTtlMs', 24 * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + ttlMs) },
    });

    return raw;
  }

  /** Always succeeds from the caller's perspective (no email-enumeration
   * signal) — a no-op if the address doesn't exist or is already verified. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return;

    try {
      const token = await this.createEmailVerificationToken(user.id);
      await this.mail.sendVerificationEmail(user.email, token);
    } catch (err) {
      this.logger.error({ err, userId: user.id }, 'Failed to send verification email on resend');
    }
  }

  async verifyEmail(rawToken: string): Promise<EmailVerificationOutcome> {
    const tokenHash = hashToken(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
      if (!record || record.consumedAt) return 'invalid';
      if (record.expiresAt < new Date()) return 'expired';

      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user) return 'invalid';

      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });

      if (user.emailVerifiedAt) return 'already-verified';

      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      return 'verified';
    });
  }

  // ── Password reset ──────────────────────────────────────────────────────

  /** Always succeeds from the caller's perspective (no email-enumeration
   * signal) — a no-op if the address doesn't exist. */
  async requestPasswordReset(email: string, requestIp?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const { raw, hash } = generateSecureToken();
    const ttlMs = this.config.get<number>('app.passwordResetTokenTtlMs', 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + ttlMs),
        requestIp: requestIp ?? null,
      },
    });

    try {
      await this.mail.sendPasswordResetEmail(user.email, raw);
    } catch (err) {
      this.logger.error({ err, userId: user.id }, 'Failed to send password reset email');
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<PasswordResetOutcome> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.consumedAt) return 'invalid';
    if (record.expiresAt < new Date()) return 'expired';

    // Hash outside the transaction, same rationale as register().
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      // A password reset proves control of the account via email, but any
      // device holding a session from before the reset (e.g. an attacker who
      // had the old password) should not remain trusted — same effect as
      // logout-all, folded into the same transaction as the password change.
      await tx.refreshTokenFamily.updateMany({
        where: { userId: record.userId },
        data: { isRevoked: true },
      });
    });

    return 'reset';
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async listSessions(userId: string, currentFamilyId: string): Promise<SessionSummary[]> {
    const families = await this.prisma.refreshTokenFamily.findMany({
      where: { userId, isRevoked: false },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, label: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true },
    });

    return families.map((f) => ({ ...f, isCurrent: f.id === currentFamilyId }));
  }

  /** Revokes one session (by RefreshTokenFamily id), scoped to the caller —
   * a user can never revoke another user's session by guessing an id. */
  async revokeSession(userId: string, familyId: string): Promise<void> {
    const result = await this.prisma.refreshTokenFamily.updateMany({
      where: { id: familyId, userId },
      data: { isRevoked: true },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }
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
