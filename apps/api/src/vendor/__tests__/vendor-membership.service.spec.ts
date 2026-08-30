import { ForbiddenException } from '@nestjs/common';
import { VendorMembershipService } from '../vendor-membership.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = 'user-1';
const VENDOR_ID = 'vendor-1';

function makePrismaMock() {
  return { vendorMember: { findFirst: jest.fn() } };
}

describe('VendorMembershipService', () => {
  let service: VendorMembershipService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new VendorMembershipService(prisma as unknown as PrismaService);
  });

  describe('findMembership', () => {
    it('returns null for a user with no vendor membership', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue(null);
      await expect(service.findMembership(USER_ID)).resolves.toBeNull();
    });

    it('returns the context for any vendor status, including PENDING', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue({
        vendorId: VENDOR_ID,
        role: 'OWNER',
        vendor: { status: 'PENDING' },
      });
      await expect(service.findMembership(USER_ID)).resolves.toEqual({
        vendorId: VENDOR_ID,
        memberRole: 'OWNER',
        vendorStatus: 'PENDING',
      });
    });
  });

  describe('requireMembership', () => {
    it('throws ForbiddenException for a user with no vendor membership', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue(null);
      await expect(service.requireMembership(USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it.each(['PENDING', 'SUSPENDED', 'REJECTED'])(
      'throws ForbiddenException when the vendor status is %s, not APPROVED',
      async (status) => {
        prisma.vendorMember.findFirst.mockResolvedValue({
          vendorId: VENDOR_ID,
          role: 'OWNER',
          vendor: { status },
        });
        await expect(service.requireMembership(USER_ID)).rejects.toThrow(ForbiddenException);
      },
    );

    it('resolves for an APPROVED vendor', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue({
        vendorId: VENDOR_ID,
        role: 'STAFF',
        vendor: { status: 'APPROVED' },
      });
      await expect(service.requireMembership(USER_ID)).resolves.toEqual({
        vendorId: VENDOR_ID,
        memberRole: 'STAFF',
        vendorStatus: 'APPROVED',
      });
    });
  });

  describe('requireOwner', () => {
    it('throws ForbiddenException for a STAFF member', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue({
        vendorId: VENDOR_ID,
        role: 'STAFF',
        vendor: { status: 'APPROVED' },
      });
      await expect(service.requireOwner(USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('resolves for an OWNER member', async () => {
      prisma.vendorMember.findFirst.mockResolvedValue({
        vendorId: VENDOR_ID,
        role: 'OWNER',
        vendor: { status: 'APPROVED' },
      });
      await expect(service.requireOwner(USER_ID)).resolves.toEqual({
        vendorId: VENDOR_ID,
        memberRole: 'OWNER',
        vendorStatus: 'APPROVED',
      });
    });
  });
});
