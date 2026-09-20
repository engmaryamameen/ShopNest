import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VendorOnboardingService } from '../vendor-onboarding.service';
import { VendorMembershipService } from '../vendor-membership.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = 'user-1';
const ADMIN_ID = 'admin-1';
const VENDOR_ID = 'vendor-1';

function makeTxMock() {
  return {
    vendor: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    vendorMember: { create: jest.fn() },
    user: { updateMany: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    vendor: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('VendorOnboardingService', () => {
  let service: VendorOnboardingService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let membership: { findMembership: jest.Mock; requireOwner: jest.Mock };

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    membership = { findMembership: jest.fn(), requireOwner: jest.fn() };
    service = new VendorOnboardingService(
      prisma as unknown as PrismaService,
      membership as unknown as VendorMembershipService,
    );
  });

  describe('apply', () => {
    it('rejects an application from a user already associated with a vendor', async () => {
      membership.findMembership.mockResolvedValue({ vendorId: VENDOR_ID, memberRole: 'OWNER', vendorStatus: 'APPROVED' });
      await expect(service.apply(USER_ID, { name: 'Acme', contactEmail: 'a@b.com' } as never)).rejects.toThrow(
        ConflictException,
      );
      expect(tx.vendor.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING vendor and an OWNER membership for the applicant, in one transaction', async () => {
      membership.findMembership.mockResolvedValue(null);
      prisma.vendor.findUnique.mockResolvedValue(null); // slug is free
      tx.vendor.create.mockResolvedValue({ id: VENDOR_ID, status: 'PENDING' });

      await service.apply(USER_ID, { name: 'Acme Outdoor', contactEmail: 'a@b.com' } as never);

      expect(tx.vendor.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', slug: 'acme-outdoor' }) }),
      );
      expect(tx.vendorMember.create).toHaveBeenCalledWith({
        data: { vendorId: VENDOR_ID, userId: USER_ID, role: 'OWNER' },
      });
    });
  });

  describe('getMyVendor', () => {
    it('throws NotFoundException for a user with no application at all', async () => {
      membership.findMembership.mockResolvedValue(null);
      await expect(service.getMyVendor(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns the vendor regardless of its status (PENDING applicant can see their own status)', async () => {
      membership.findMembership.mockResolvedValue({ vendorId: VENDOR_ID, memberRole: 'OWNER', vendorStatus: 'PENDING' });
      prisma.vendor.findUniqueOrThrow.mockResolvedValue({ id: VENDOR_ID, status: 'PENDING' });
      await expect(service.getMyVendor(USER_ID)).resolves.toEqual({ id: VENDOR_ID, status: 'PENDING' });
    });
  });

  describe('updateProfile', () => {
    it('delegates ownership enforcement to requireOwner (STAFF is rejected there)', async () => {
      membership.requireOwner.mockRejectedValue(new ForbiddenException());
      await expect(service.updateProfile(USER_ID, { name: 'New name' } as never)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an update with no fields provided', async () => {
      membership.requireOwner.mockResolvedValue({ vendorId: VENDOR_ID, memberRole: 'OWNER', vendorStatus: 'APPROVED' });
      await expect(service.updateProfile(USER_ID, {} as never)).rejects.toThrow(BadRequestException);
    });
  });

  describe('adminUpdateStatus', () => {
    it('throws NotFoundException for a vendor that does not exist', async () => {
      tx.vendor.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateStatus(VENDOR_ID, 'APPROVED' as never, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects REJECTED -> APPROVED — REJECTED is terminal', async () => {
      tx.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, status: 'REJECTED' });
      await expect(service.adminUpdateStatus(VENDOR_ID, 'APPROVED' as never, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects PENDING -> SUSPENDED — a vendor must be approved before it can be suspended', async () => {
      tx.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, status: 'PENDING' });
      await expect(service.adminUpdateStatus(VENDOR_ID, 'SUSPENDED' as never, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approving a PENDING vendor sets approvedAt/approvedByUserId and promotes every CUSTOMER member to VENDOR', async () => {
      tx.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, status: 'PENDING' });
      tx.vendor.update.mockResolvedValue({ id: VENDOR_ID, status: 'APPROVED' });

      await service.adminUpdateStatus(VENDOR_ID, 'APPROVED' as never, ADMIN_ID);

      expect(tx.vendor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED', approvedByUserId: ADMIN_ID }),
        }),
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { vendorMemberships: { some: { vendorId: VENDOR_ID } }, role: 'CUSTOMER' },
        data: { role: 'VENDOR' },
      });
    });

    it('suspending an APPROVED vendor does not touch User.role (VendorMembershipService gates on live vendor.status instead)', async () => {
      tx.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, status: 'APPROVED' });
      tx.vendor.update.mockResolvedValue({ id: VENDOR_ID, status: 'SUSPENDED' });

      await service.adminUpdateStatus(VENDOR_ID, 'SUSPENDED' as never, ADMIN_ID);

      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });
  });
});
