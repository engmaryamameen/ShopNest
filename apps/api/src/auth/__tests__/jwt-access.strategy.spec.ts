import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAccessStrategy } from '../strategies/jwt-access.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

function makeConfig(): ConfigService {
  return { getOrThrow: () => 'test-secret' } as unknown as ConfigService;
}

function makePrisma(family: unknown) {
  return {
    refreshTokenFamily: { findUnique: jest.fn().mockResolvedValue(family) },
  } as unknown as PrismaService;
}

function makeFailingPrisma(error: Error) {
  return {
    refreshTokenFamily: { findUnique: jest.fn().mockRejectedValue(error) },
  } as unknown as PrismaService;
}

const BASE_PAYLOAD: JwtPayload = {
  sub: 'user-1',
  email: 'vendor@example.com',
  role: 'CUSTOMER',
  familyId: 'family-1',
};

describe('JwtAccessStrategy', () => {
  it('rejects a revoked token family', async () => {
    const strategy = new JwtAccessStrategy(makeConfig(), makePrisma({ isRevoked: true, user: { status: 'ACTIVE', role: 'CUSTOMER' } }));
    await expect(strategy.validate(BASE_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token whose family no longer exists', async () => {
    const strategy = new JwtAccessStrategy(makeConfig(), makePrisma(null));
    await expect(strategy.validate(BASE_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a suspended account even with a still-valid token', async () => {
    const strategy = new JwtAccessStrategy(
      makeConfig(),
      makePrisma({ isRevoked: false, user: { status: 'SUSPENDED', role: 'CUSTOMER' } }),
    );
    await expect(strategy.validate(BASE_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  // This is the specific gap a real-browser walkthrough surfaced: a user
  // approved as a vendor (role flips CUSTOMER -> VENDOR server-side) must
  // not stay locked out of every @Roles(VENDOR) endpoint for the rest of
  // their still-valid access token's 15-minute life just because the
  // token was minted before the promotion. The live DB role — not the
  // token's embedded claim — is what RolesGuard must see.
  it('returns the LIVE role from the database, not the stale role embedded in the token', async () => {
    const strategy = new JwtAccessStrategy(
      makeConfig(),
      makePrisma({ isRevoked: false, user: { status: 'ACTIVE', role: 'VENDOR' } }),
    );
    const result = await strategy.validate(BASE_PAYLOAD); // payload still says CUSTOMER
    expect(result.role).toBe('VENDOR');
  });

  it('preserves the rest of the payload unchanged', async () => {
    const strategy = new JwtAccessStrategy(
      makeConfig(),
      makePrisma({ isRevoked: false, user: { status: 'ACTIVE', role: 'CUSTOMER' } }),
    );
    const result = await strategy.validate(BASE_PAYLOAD);
    expect(result).toEqual({ ...BASE_PAYLOAD, role: 'CUSTOMER' });
  });

  it('selects only status and role from the user — no email, password hash, or other PII on the hot authentication path', async () => {
    const prisma = makePrisma({ isRevoked: false, user: { status: 'ACTIVE', role: 'CUSTOMER' } });
    const strategy = new JwtAccessStrategy(makeConfig(), prisma);
    await strategy.validate(BASE_PAYLOAD);

    const call = (prisma.refreshTokenFamily.findUnique as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ id: BASE_PAYLOAD.familyId }); // RefreshTokenFamily's primary key — always indexed
    expect(call.select).toEqual({ isRevoked: true, user: { select: { status: true, role: true } } });
  });

  // Item 6: a database outage during this per-request live check must
  // fail closed — never silently fall back to trusting the token's own
  // (unverified-against-the-DB) embedded claims. validate() has exactly
  // one job here: reject. Nothing upstream (JwtAuthGuard's default
  // handleRequest, OptionalJwtAuthGuard's override — see that guard's own
  // spec) turns this rejection into an authenticated request.
  it('fails closed — propagates a database error rather than falling back to the token payload', async () => {
    const dbError = new Error('connection to database failed');
    const strategy = new JwtAccessStrategy(makeConfig(), makeFailingPrisma(dbError));
    await expect(strategy.validate(BASE_PAYLOAD)).rejects.toThrow('connection to database failed');
  });
});
