import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken } from './token.util';
import { RegisterDto } from './dto/register.dto';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type PendingRow = { id: string; email: string; fullName: string | null; passwordHash: string; codeHash: string; expiresAt: Date; attempts: number };

@Injectable()
export class SignupService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: MailService) {}

  private codeHash(challenge: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('app.jwtRefreshSecret')).update(`${challenge}:${code}`).digest('hex');
  }

  private newCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }

  async begin(dto: RegisterDto): Promise<string> {
    const challenge = randomBytes(32).toString('hex');
    const code = this.newCode();
    const data = {
      fullName: dto.fullName ?? null,
      passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
      challengeHash: hashToken(challenge),
      codeHash: this.codeHash(challenge, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      lastSentAt: new Date(),
      attempts: 0,
    };
    await this.prisma.pendingSignup.upsert({ where: { email: dto.email }, create: { email: dto.email, ...data }, update: data });
    try {
      await this.mail.sendSignupCode(dto.email, code);
    } catch {
      await this.prisma.pendingSignup.deleteMany({ where: { challengeHash: data.challengeHash } });
      throw new ServiceUnavailableException('We could not send your verification code. Please try again.');
    }
    return challenge;
  }

  async resend(challenge: string): Promise<void> {
    if (!challenge) throw new BadRequestException('Please start signup again.');
    const challengeHash = hashToken(challenge);
    const pending = await this.prisma.pendingSignup.findUnique({ where: { challengeHash } });
    if (!pending) throw new BadRequestException('Please start signup again.');
    const now = new Date();
    const code = this.newCode();
    const nextHash = this.codeHash(challenge, code);
    const updated = await this.prisma.pendingSignup.updateMany({
      where: { challengeHash, codeHash: pending.codeHash, lastSentAt: { lte: new Date(now.getTime() - RESEND_DELAY_MS) } },
      data: { codeHash: nextHash, expiresAt: new Date(now.getTime() + CODE_TTL_MS), lastSentAt: now, attempts: 0 },
    });
    if (updated.count !== 1) throw new HttpException('Please wait a minute before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
    try { await this.mail.sendSignupCode(pending.email, code); }
    catch {
      // Do not overwrite a newer code or undo a concurrent verification attempt.
      await this.prisma.pendingSignup.updateMany({
        where: { challengeHash, codeHash: nextHash, lastSentAt: now, attempts: 0 },
        data: { codeHash: pending.codeHash, expiresAt: pending.expiresAt, lastSentAt: pending.lastSentAt, attempts: pending.attempts },
      });
      throw new ServiceUnavailableException('We could not send your verification code. Please try again.');
    }
  }

  async verify(challenge: string, code: string): Promise<string> {
    if (!challenge) throw new BadRequestException('Please start signup again.');
    const digest = this.codeHash(challenge, code);
    const result = await this.prisma.$transaction(async (tx) => {
      const [pending] = await tx.$queryRaw<PendingRow[]>`SELECT "id", "email", "fullName", "passwordHash", "codeHash", "expiresAt", "attempts" FROM "PendingSignup" WHERE "challengeHash" = ${hashToken(challenge)} FOR UPDATE`;
      if (!pending) return { kind: 'missing' as const };
      if (pending.expiresAt.getTime() <= Date.now()) return { kind: 'expired' as const };
      if (pending.attempts >= MAX_ATTEMPTS) return { kind: 'locked' as const };
      if (!timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(pending.codeHash, 'hex'))) {
        await tx.pendingSignup.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
        return { kind: 'invalid' as const };
      }
      if (await tx.user.findUnique({ where: { email: pending.email }, select: { id: true } })) {
        await tx.pendingSignup.delete({ where: { id: pending.id } });
        return { kind: 'exists' as const };
      }
      const user = await tx.user.create({ data: { email: pending.email, fullName: pending.fullName, passwordHash: pending.passwordHash, emailVerifiedAt: new Date() } });
      await tx.cart.create({ data: { userId: user.id } });
      await tx.pendingSignup.delete({ where: { id: pending.id } });
      return { kind: 'verified' as const, userId: user.id };
    });
    if (result.kind === 'verified') return result.userId;
    if (result.kind === 'exists') throw new ConflictException('An account already exists for this email. Please sign in.');
    if (result.kind === 'expired') throw new BadRequestException('This code has expired. Request a new code.');
    if (result.kind === 'locked') throw new BadRequestException('Too many attempts. Request a new code.');
    if (result.kind === 'missing') throw new BadRequestException('Please start signup again.');
    throw new BadRequestException('That code is not correct. Please try again.');
  }
}
