import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ActingAdmin {
  id: string;
  role: Role;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true, createdAt: true },
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Suspending a user must also cut off any session they currently hold —
   * `JwtAccessStrategy` re-checks `status` on every request (defense in
   * depth), but revoking the refresh-token families too means a suspended
   * user can't even silently refresh their way to a new access token.
   */
  async updateStatus(
    targetUserId: string,
    status: typeof UserStatus.ACTIVE | typeof UserStatus.SUSPENDED,
    actingAdmin: ActingAdmin,
  ): Promise<{ id: string; email: string; status: UserStatus }> {
    if (targetUserId === actingAdmin.id && status === UserStatus.SUSPENDED) {
      throw new BadRequestException('You cannot suspend your own account.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');

    this.assertCanModify(actingAdmin.role, user.role);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === UserStatus.SUSPENDED && user.role === Role.SUPER_ADMIN) {
        const activeSuperAdmins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' FOR UPDATE
        `;
        const othersStillActive = activeSuperAdmins.some((row) => row.id !== targetUserId);
        if (!othersStillActive) {
          throw new BadRequestException('Cannot suspend the last active super admin account.');
        }
      }

      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { status },
        select: { id: true, email: true, status: true },
      });

      if (status === UserStatus.SUSPENDED) {
        await tx.refreshTokenFamily.updateMany({
          where: { userId: targetUserId },
          data: { isRevoked: true },
        });
      }

      return u;
    });

    return updated;
  }

  private assertCanModify(actingRole: Role, targetRole: Role): void {
    if (actingRole === Role.SUPER_ADMIN) return;
    if (targetRole === Role.ADMIN || targetRole === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can modify an admin account.');
    }
  }
}
