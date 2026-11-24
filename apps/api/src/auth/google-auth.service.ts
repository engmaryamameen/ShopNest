import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

type Flow = { state: string; nonce: string; verifier: string; returnTo: string };

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/shop';
  try {
    const url = new URL(value, 'https://shopnest.invalid');
    return url.origin === 'https://shopnest.invalid' ? url.pathname + url.search : '/shop';
  } catch { return '/shop'; }
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  constructor(private readonly config: ConfigService, private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  private settings() {
    const clientId = this.config.get<string>('app.googleClientId') ?? '';
    const clientSecret = this.config.get<string>('app.googleClientSecret') ?? '';
    const callback = this.config.get<string>('app.googleCallbackUrl') ?? '';
    if (!clientId || !clientSecret || !callback) throw new ServiceUnavailableException('Google sign-in is not configured.');
    let url: URL;
    try { url = new URL(callback); } catch { throw new ServiceUnavailableException('Google sign-in is not configured.'); }
    if ((url.protocol !== 'https:' && !(this.config.get('app.nodeEnv') !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost')) || url.username || url.password) {
      throw new ServiceUnavailableException('Google sign-in is not configured.');
    }
    return { clientId, clientSecret, callback };
  }

  begin(returnTo: unknown): { url: string; cookie: string } {
    const { clientId, clientSecret, callback } = this.settings();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const flow: Flow = { state, nonce, verifier, returnTo: safeReturnTo(returnTo) };
    const client = new OAuth2Client(clientId, clientSecret, callback);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = client.generateAuthUrl({ response_type: 'code', scope: ['openid', 'email', 'profile'], state, nonce, code_challenge: challenge, code_challenge_method: CodeChallengeMethod.S256 });
    return { url, cookie: this.jwt.sign(flow, { expiresIn: '10m' }) };
  }

  async complete(cookie: string | undefined, state: unknown, code: unknown): Promise<{ kind: 'signed-in'; userId: string; returnTo: string } | { kind: 'link'; proof: string; returnTo: string }> {
    if (!cookie || typeof state !== 'string' || typeof code !== 'string' || !code) throw new BadRequestException('Google sign-in could not be completed.');
    let flow: Flow;
    try { flow = this.jwt.verify<Flow>(cookie); } catch { throw new BadRequestException('Google sign-in expired. Please try again.'); }
    const received = Buffer.from(state); const expected = Buffer.from(flow.state ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new BadRequestException('Google sign-in could not be completed.');
    const { clientId, clientSecret, callback } = this.settings();
    const client = new OAuth2Client(clientId, clientSecret, callback);
    let payload;
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier, redirect_uri: callback });
      if (!tokens.id_token) throw new Error('Missing ID token');
      payload = (await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId })).getPayload();
    } catch (error) {
      const failure = error as { code?: string | number; response?: { status?: number } };
      const code = typeof failure.code === 'string' && /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(failure.code) ? failure.code : undefined;
      this.logger.warn(`Google token validation failed${failure.response?.status ? ` (HTTP ${failure.response.status})` : code ? ` (${code})` : ''}.`);
      throw new UnauthorizedException('Google sign-in could not be completed.');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified || payload.nonce !== flow.nonce) throw new UnauthorizedException('Google sign-in could not be completed.');
    const existing = await this.prisma.googleIdentity.findUnique({ where: { subject: payload.sub }, include: { user: true } });
    if (existing) {
      if (existing.user.status !== 'ACTIVE') throw new ForbiddenException('This account is not active.');
      return { kind: 'signed-in', userId: existing.user.id, returnTo: safeReturnTo(flow.returnTo) };
    }
    const email = payload.email.trim().toLowerCase();
    const account = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true, emailVerifiedAt: true } });
    if (account) {
      if (account.status !== 'ACTIVE') throw new ForbiddenException('This account is not active.');
      const authoritative = email.endsWith('@gmail.com') || (typeof payload.hd === 'string' && payload.hd.toLowerCase() === email.split('@')[1]);
      const proof = this.jwt.sign({ kind: 'google-link', subject: payload.sub, userId: account.id, email, direct: authoritative, returnTo: safeReturnTo(flow.returnTo) }, { expiresIn: '10m' });
      return { kind: 'link', proof, returnTo: safeReturnTo(flow.returnTo) };
    }
    const passwordHash = await argon2.hash(randomBytes(48).toString('base64url'));
    try {
      const user = await this.prisma.user.create({ data: { email, fullName: payload.name?.slice(0, 100) || null, passwordHash, emailVerifiedAt: new Date(), cart: { create: {} }, googleIdentity: { create: { subject: payload.sub } } }, select: { id: true } });
      return { kind: 'signed-in', userId: user.id, returnTo: safeReturnTo(flow.returnTo) };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Google sign-in could not create this account. Please sign in with your existing method.');
      throw error;
    }
  }

  async confirmDirectLink(proof: string | undefined): Promise<{ kind: 'requires-signin' } | { kind: 'linked'; userId: string; returnTo: string }> {
    let claims: { kind: string; subject: string; userId: string; email: string; direct: boolean; returnTo: string };
    try { claims = this.jwt.verify(proof ?? ''); } catch { throw new BadRequestException('The Google linking request has expired. Start again.'); }
    if (claims.kind !== 'google-link' || !claims.userId || !claims.subject) throw new BadRequestException('The Google linking request is invalid.');
    if (!claims.direct) return { kind: 'requires-signin' };
    const replacementHash = await argon2.hash(randomBytes(48).toString('base64url'));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [user] = await tx.$queryRaw<Array<{ id: string; email: string; status: string; emailVerifiedAt: Date | null }>>`SELECT "id", "email", "status", "emailVerifiedAt" FROM "User" WHERE "id" = ${claims.userId}::uuid FOR UPDATE`;
        if (!user || user.status !== 'ACTIVE' || user.email !== claims.email) throw new ForbiddenException('Sign in to your ShopNest account to link Google.');
        await tx.googleIdentity.create({ data: { subject: claims.subject, userId: user.id } });
        if (!user.emailVerifiedAt) {
          await tx.user.update({ where: { id: user.id }, data: { passwordHash: replacementHash, emailVerifiedAt: new Date() } });
          await tx.refreshTokenFamily.updateMany({ where: { userId: user.id }, data: { isRevoked: true } });
          await tx.passwordResetToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
          await tx.emailVerificationToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
        }
        return { kind: 'linked' as const, userId: user.id, returnTo: safeReturnTo(claims.returnTo) };
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('This Google account is already linked. Please sign in with Google.');
      throw error;
    }
  }

  async link(proof: string | undefined, userId: string): Promise<string> {
    let claims: { kind: string; subject: string; userId: string; returnTo: string };
    try { claims = this.jwt.verify(proof ?? ''); } catch { throw new BadRequestException('The Google linking request has expired. Start again.'); }
    if (claims.kind !== 'google-link' || !claims.subject || claims.userId !== userId) throw new ForbiddenException('Sign in to the account that matches the Google email.');
    const existing = await this.prisma.googleIdentity.findUnique({ where: { subject: claims.subject } });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException('This Google account is already linked to another account.');
      return safeReturnTo(claims.returnTo);
    }
    try { await this.prisma.googleIdentity.create({ data: { subject: claims.subject, userId } }); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('This account already has a Google sign-in linked.');
      throw error;
    }
    return safeReturnTo(claims.returnTo);
  }

}
