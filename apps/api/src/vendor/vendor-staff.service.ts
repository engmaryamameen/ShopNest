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

  /** Owner-only. A revoked invite's token stops working immediately —
   * `acceptInvite` checks `revokedAt` alongside `consumedAt`/`expiresAt`,
   * so this takes effect on the very next accept attempt, not on some
   * later cleanup pass. Revoking an invite that's already been accepted
   * doesn't make sense (the membership it created is revoked via
   * `revoke()` instead) and is rejected rather than silently no-op'd. */
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

  /** The accepting user must already be authenticated, and their account
   * email must match the invited address — otherwise anyone who guesses/
   * intercepts a token could join a vendor under a different identity than
   * the one it was actually sent to. */
  async acceptInvite(userId: string, userEmail: string, rawToken: string) {
    const hash = hashToken(rawToken);
    const invite = await this.prisma.vendorStaffInvite.findUnique({ where: { tokenHash: hash } });

    // Covers revoked, already-accepted, and expired invites with the same
    // message — deliberately not distinguishing which, so a stale/guessed
    // token doesn't leak which failure mode applies.
    if (!invite || invite.consumedAt || invite.revokedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite is invalid or has expired');
    }
    // Both sides normalized the same way (trim + lowercase) — the invite's
    // email was already normalized at creation time (InviteVendorStaffDto),
    // this is defense-in-depth against any invite row that predates that
    // normalization or was written by a different path.
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
      // Two concurrent accept calls (double-click, a retried request) can
      // both pass the consumedAt check above before either commits, then
      // race on the same (vendorId, userId) upsert — the loser hits a real
      // P2002 rather than silently falling back to its own update branch.
      // Accepting the same invite twice should be a harmless no-op from
      // the caller's point of view, not a 500 or a spurious duplicate —
      // resolve it by returning the membership the winner just created.
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
