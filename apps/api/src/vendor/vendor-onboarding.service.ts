import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, VendorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VendorMembershipService } from './vendor-membership.service';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';

/** Valid admin-initiated status transitions. PENDING is never a target —
 * an admin action always moves a vendor forward or sideways, never back to
 * "undecided." Simpler than OrderStatus's state machine (only ever admin-
 * driven, no customer-facing transitions to reconcile), so this stays
 * inline rather than its own file. */
const VALID_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  [VendorStatus.PENDING]: [VendorStatus.APPROVED, VendorStatus.REJECTED],
  [VendorStatus.APPROVED]: [VendorStatus.SUSPENDED],
  [VendorStatus.SUSPENDED]: [VendorStatus.APPROVED],
  [VendorStatus.REJECTED]: [],
};

@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: VendorMembershipService,
  ) {}

  async apply(userId: string, dto: ApplyVendorDto) {
    const existing = await this.membership.findMembership(userId);
    if (existing) {
      throw new ConflictException('This account is already associated with a vendor');
    }

    const slug = await this.resolveUniqueSlug(this.slugify(dto.name));

    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          logoUrl: dto.logoUrl,
          contactEmail: dto.contactEmail,
          status: VendorStatus.PENDING,
        },
      });

      await tx.vendorMember.create({
        data: { vendorId: vendor.id, userId, role: 'OWNER' },
      });

      return vendor;
    });
  }

  /** Any status — a pending/rejected/suspended applicant can still see
   * their own application. */
  async getMyVendor(userId: string) {
    const context = await this.membership.findMembership(userId);
    if (!context) throw new NotFoundException('No vendor application found for this account');

    return this.prisma.vendor.findUniqueOrThrow({ where: { id: context.vendorId } });
  }

  async updateProfile(userId: string, dto: UpdateVendorProfileDto) {
    const { vendorId } = await this.membership.requireOwner(userId);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    return this.prisma.vendor.update({ where: { id: vendorId }, data });
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async adminList(status?: VendorStatus) {
    return this.prisma.vendor.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { members: { where: { role: 'OWNER' }, include: { user: { select: { id: true, email: true } } } } },
    });
  }

  async adminGetOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, email: true } } } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async adminUpdateStatus(vendorId: string, toStatus: VendorStatus, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) throw new NotFoundException('Vendor not found');

      if (!VALID_TRANSITIONS[vendor.status].includes(toStatus)) {
        throw new BadRequestException(`Cannot move a vendor from ${vendor.status} to ${toStatus}`);
      }

      const updated = await tx.vendor.update({
        where: { id: vendorId },
        data: {
          status: toStatus,
          ...(toStatus === VendorStatus.APPROVED ? { approvedAt: new Date(), approvedByUserId: adminId } : {}),
        },
      });

      // Approval is what actually grants access to /vendor/* routes
      // (RolesGuard checks the JWT's role claim) — every OWNER/STAFF
      // member's platform role is promoted at that point, not at
      // application time (a PENDING applicant has no vendor capabilities
      // yet, only visibility into their own application status).
      if (toStatus === VendorStatus.APPROVED) {
        await tx.user.updateMany({
          where: { vendorMemberships: { some: { vendorId } }, role: Role.CUSTOMER },
          data: { role: Role.VENDOR },
        });
      }

      return updated;
    });
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async resolveUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let attempt = 1;
    while (true) {
      const existing = await this.prisma.vendor.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
      attempt++;
      candidate = `${base}-${attempt}`;
    }
  }
}
