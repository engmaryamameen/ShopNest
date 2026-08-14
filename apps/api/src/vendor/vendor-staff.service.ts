import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, VendorMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { generateSecureToken, hashToken } from '../auth/token.util';
import { VendorMembershipService } from './vendor-membership.service';
import { InviteVendorStaffDto } from './dto/invite-vendor-staff.dto';

@Injectable()
export class VendorStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: VendorMembershipService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string) {
    const { vendorId } = await this.membership.requireOwner(userId);

    const [members, pendingInvites] = await Promise.all([
      this.prisma.vendorMember.findMany({
        where: { vendorId },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.vendorStaffInvite.findMany({
        where: { vendorId, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { members, pendingInvites };
  }

  /** Owner-only. Can't revoke an already-accepted invite — use revoke()
   * on the membership instead. */
  async revokeInvite(userId: string, inviteId: string): Promise<void> {
    const { vendorId } = await this.membership.requireOwner(userId);
    const invite = await this.prisma.vendorStaffInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.vendorId !== vendorId) throw new NotFoundException('Invite not found');
    if (invite.consumedAt) throw new BadRequestException('This invite has already been accepted — revoke their membership instead');
    if (invite.revokedAt) return; // already revoked — idempotent, not an error

    await this.prisma.vendorStaffInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  }

  async invite(userId: string, dto: InviteVendorStaffDto) {
    const { vendorId } = await this.membership.requireOwner(userId);
    const vendor = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });

    const alreadyMember = await this.prisma.vendorMember.findFirst({
      where: { vendorId, user: { email: dto.email } },
    });
    if (alreadyMember) {
      throw new ConflictException('This person is already a member of your vendor account');
    }

    const { raw, hash } = generateSecureToken();
    const ttlMs = this.config.get<number>('app.vendorStaffInviteTtlMs', 7 * 24 * 60 * 60 * 1000);

    await this.prisma.vendorStaffInvite.create({
      data: {
        vendorId,
        email: dto.email,
        role: VendorMemberRole.STAFF,
        tokenHash: hash,
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    await this.mail.sendVendorStaffInviteEmail(dto.email, vendor.name, raw);

    return { status: 'invited' as const };
  }

  /** Accepting account's email must match the invited address. */
  async acceptInvite(userId: string, userEmail: string, rawToken: string) {
    const hash = hashToken(rawToken);
    const invite = await this.prisma.vendorStaffInvite.findUnique({ where: { tokenHash: hash } });

    // One message for revoked/accepted/expired — don't leak which.
    if (!invite || invite.consumedAt || invite.revokedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite is invalid or has expired');
    }
    if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new BadRequestException('This invite was sent to a different email address');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.vendorStaffInvite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } });

        const member = await tx.vendorMember.upsert({
          where: { vendorId_userId: { vendorId: invite.vendorId, userId } },
          update: {},
          create: { vendorId: invite.vendorId, userId, role: invite.role },
        });

        await tx.user.updateMany({
          where: { id: userId, role: Role.CUSTOMER },
          data: { role: Role.VENDOR },
        });

        return member;
      });
    } catch (error) {
      // Concurrent double-accept can race on the upsert — the loser gets
      // the winner's row instead of a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.vendorMember.findUnique({
          where: { vendorId_userId: { vendorId: invite.vendorId, userId } },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async updateRole(userId: string, memberId: string, role: VendorMemberRole) {
    const { vendorId } = await this.membership.requireOwner(userId);
    const member = await this.ownedMember(vendorId, memberId);

    if (member.role === VendorMemberRole.OWNER && role === VendorMemberRole.STAFF) {
      await this.assertNotLastOwner(vendorId, memberId);
    }

    return this.prisma.vendorMember.update({ where: { id: memberId }, data: { role } });
  }

  async revoke(userId: string, memberId: string) {
    const { vendorId } = await this.membership.requireOwner(userId);
    const member = await this.ownedMember(vendorId, memberId);

    if (member.role === VendorMemberRole.OWNER) {
      await this.assertNotLastOwner(vendorId, memberId);
    }

    await this.prisma.vendorMember.delete({ where: { id: memberId } });
  }

  private async ownedMember(vendorId: string, memberId: string) {
    const member = await this.prisma.vendorMember.findUnique({ where: { id: memberId } });
    if (!member || member.vendorId !== vendorId) throw new NotFoundException('Member not found');
    return member;
  }

  private async assertNotLastOwner(vendorId: string, excludingMemberId: string): Promise<void> {
    const otherOwners = await this.prisma.vendorMember.count({
      where: { vendorId, role: VendorMemberRole.OWNER, id: { not: excludingMemberId } },
    });
    if (otherOwners === 0) {
      throw new BadRequestException('A vendor must always have at least one owner');
    }
  }
}
