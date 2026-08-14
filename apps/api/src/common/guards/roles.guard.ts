import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const actualRole = request.user?.role as Role;

    // SUPER_ADMIN implicitly satisfies every plain ADMIN-gated route — a
    // one-directional hierarchy, not a role alias. This is the one place
    // that rule is expressed, so every existing and future
    // `@Roles(Role.ADMIN)` call site keeps working for a SUPER_ADMIN
    // without having to be rewritten to list both roles explicitly.
    // SUPER_ADMIN-only routes (e.g. admin account management) still gate on
    // `@Roles(Role.SUPER_ADMIN)` alone and are correctly refused to a plain
    // ADMIN — the hierarchy only runs one way.
    if (actualRole === Role.SUPER_ADMIN && requiredRoles.includes(Role.ADMIN)) return true;

    return requiredRoles.includes(actualRole);
  }
}
