import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Global guard that attempts JWT authentication but does NOT throw when the
 * request is unauthenticated. It populates request.user if a valid token is
 * present, then lets downstream guards (RolesGuard, JwtAuthGuard) enforce
 * access control.
 *
 * This solves the guard ordering problem: APP_GUARD providers run before
 * route-level @UseGuards(), so if JwtAuthGuard were the only auth guard,
 * RolesGuard would find request.user === undefined and deny every admin route.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt-access') {
  handleRequest<TUser>(_err: Error | null, user: TUser): TUser {
    return user;
  }
}
