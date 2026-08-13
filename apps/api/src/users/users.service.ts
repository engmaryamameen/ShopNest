import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
    actingAdminId: string,
  ): Promise<{ id: string; email: string; status: UserStatus }> {
    if (targetUserId === actingAdminId && status === UserStatus.SUSPENDED) {
      throw new BadRequestException('You cannot suspend your own account.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
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
}
