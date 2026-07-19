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
    // Check that the token family has not been revoked.
    // This ensures instant revocation on logout-all — no token blacklist needed.
    const family = await this.prisma.refreshTokenFamily.findUnique({
      where: { id: payload.familyId },
      select: { isRevoked: true },
    });

    if (!family || family.isRevoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return payload;
  }
}
