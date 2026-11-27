import { ForbiddenException, Injectable } from '@nestjs/common';
import { VendorMemberRole, VendorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface VendorContext {
  vendorId: string;
  memberRole: VendorMemberRole;
  vendorStatus: VendorStatus;
}

/**
 * Resolves "which vendor does this authenticated user act for" — the one
 * chokepoint every vendor-scoped service goes through before touching
 * `VendorOffer`/`VendorOrder`/etc. `vendorId` is never accepted from the
 * request (body, param, or query) for a mutation; it always comes from
 * here, derived from the caller's own `VendorMember` row. This is the same
 * discipline `OrdersService` already applies to customer order ownership
 * (`order.userId !== actorId` checks), extended to vendor ownership.
 *
 * Checks the *live* `Vendor.status` on every call, not just `User.role` —
 * a suspended vendor's members keep their `Role.VENDOR` JWT claim until
 * their access token naturally expires (same reasoning as
 * `JwtAccessStrategy` re-checking `User.status` per request rather than
 * trusting a point-in-time claim).
 */
@Injectable()
export class VendorMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** No-throw lookup, any vendor status — for "check my own application's
   * status" (a PENDING applicant is allowed to see that it's pending; they
   * just can't do anything vendor-functional yet, see requireMembership). */
  async findMembership(userId: string): Promise<VendorContext | null> {
    const membership = await this.prisma.vendorMember.findFirst({
      where: { userId },
      select: { vendorId: true, role: true, vendor: { select: { status: true } } },
    });
    if (!membership) return null;
    return { vendorId: membership.vendorId, memberRole: membership.role, vendorStatus: membership.vendor.status };
  }

  /** Throws if the user has no vendor membership, or their vendor isn't
   * currently APPROVED — every functional vendor-app route (offers,
   * orders, staff management) requires both. */
  async requireMembership(userId: string): Promise<VendorContext> {
    const context = await this.findMembership(userId);
    if (!context) {
      throw new ForbiddenException('This account is not associated with a vendor');
    }
    if (context.vendorStatus !== VendorStatus.APPROVED) {
      throw new ForbiddenException(`This vendor account is ${context.vendorStatus.toLowerCase()}`);
    }
    return context;
  }

  /** Owner-only actions (managing staff, editing the store profile) —
   * staff can sell and fulfil, but not reconfigure the vendor account. */
  async requireOwner(userId: string): Promise<VendorContext> {
    const context = await this.requireMembership(userId);
    if (context.memberRole !== VendorMemberRole.OWNER) {
      throw new ForbiddenException('Only the vendor owner can perform this action');
    }
    return context;
  }
}
