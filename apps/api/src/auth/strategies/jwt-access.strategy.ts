import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

function extractFromCookie(req: Request): string | null {
  return req.cookies?.['access_token'] ?? null;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.getOrThrow<string>('app.jwtAccessSecret'),
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check that the token family has not been revoked, and that the user
    // is still ACTIVE — both in one round trip. This ensures instant
    // revocation on logout-all AND instant enforcement of a mid-session
    // suspension (an access token can be live for up to 15 minutes after an
    // admin suspends the account) — no token blacklist needed for either.
    const family = await this.prisma.refreshTokenFamily.findUnique({
      where: { id: payload.familyId },
      select: { isRevoked: true, user: { select: { status: true } } },
    });

    if (!family || family.isRevoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (family.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    return payload;
  }
}
