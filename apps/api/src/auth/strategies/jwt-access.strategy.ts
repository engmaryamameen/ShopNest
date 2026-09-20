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
    // Live check, not the token's claims — enforces revocation and
    // suspension instantly, no blacklist needed.
    const family = await this.prisma.refreshTokenFamily.findUnique({
      where: { id: payload.familyId },
      select: { isRevoked: true, user: { select: { status: true, role: true } } },
    });

    if (!family || family.isRevoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (family.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    // Live role, not the stale claim baked into the token at issue time.
    return { ...payload, role: family.user.role };
  }
}
