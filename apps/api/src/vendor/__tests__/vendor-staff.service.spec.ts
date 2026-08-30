import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VendorStaffService } from '../vendor-staff.service';
import { VendorMembershipService } from '../vendor-membership.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import * as tokenUtil from '../../auth/token.util';

const USER_ID = 'user-1';
const OWNER_ID = 'owner-1';
const VENDOR_ID = 'vendor-1';
const MEMBER_ID = 'member-1';

function prismaUniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.10.1' });
}

function makeTxMock() {
  return {
    vendorStaffInvite: { update: jest.fn() },
    vendorMember: { upsert: jest.fn() },
    user: { updateMany: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    vendor: { findUniqueOrThrow: jest.fn() },
    vendorMember: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    vendorStaffInvite: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('VendorStaffService', () => {
  let service: VendorStaffService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let membership: { requireOwner: jest.Mock };
  let mail: { sendVendorStaffInviteEmail: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    membership = { requireOwner: jest.fn().mockResolvedValue({ vendorId: VENDOR_ID, memberRole: 'OWNER' }) };
    mail = { sendVendorStaffInviteEmail: jest.fn() };
    config = { get: jest.fn().mockReturnValue(7 * 24 * 60 * 60 * 1000) };
    service = new VendorStaffService(
      prisma as unknown as PrismaService,
      membership as unknown as VendorMembershipService,
      mail as unknown as MailService,
      config as never,
    );
  });

  describe('invite', () => {
    it('rejects inviting someone who is already a member', async () => {
      prisma.vendor.findUniqueOrThrow.mockResolvedValue({ id: VENDOR_ID, name: 'Acme' });
      prisma.vendorMember.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.invite(OWNER_ID, { email: 'staff@x.com' } as never)).rejects.toThrow(ConflictException);
      expect(mail.sendVendorStaffInviteEmail).not.toHaveBeenCalled();
    });

    it('creates a hashed, single-use invite and emails the raw token — never the hash', async () => {
      prisma.vendor.findUniqueOrThrow.mockResolvedValue({ id: VENDOR_ID, name: 'Acme' });
      prisma.vendorMember.findFirst.mockResolvedValue(null);
      jest.spyOn(tokenUtil, 'generateSecureToken').mockReturnValue({ raw: 'raw-token', hash: 'hashed-token' });

      await service.invite(OWNER_ID, { email: 'staff@x.com' } as never);

      expect(prisma.vendorStaffInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tokenHash: 'hashed-token', vendorId: VENDOR_ID }) }),
      );
      expect(mail.sendVendorStaffInviteEmail).toHaveBeenCalledWith('staff@x.com', 'Acme', 'raw-token');
    });
  });

  describe('acceptInvite', () => {
    it('rejects an unknown token', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue(null);
      await expect(service.acceptInvite(USER_ID, 'me@x.com', 'bad-token')).rejects.toThrow(BadRequestException);
    });

    it('rejects an already-consumed invite', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'me@x.com',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 100_000),
      });
      await expect(service.acceptInvite(USER_ID, 'me@x.com', 'token')).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired invite', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'me@x.com',
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.acceptInvite(USER_ID, 'me@x.com', 'token')).rejects.toThrow(BadRequestException);
    });

    it("rejects when the accepting account's email doesn't match the invited address", async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        email: 'invited@x.com',
        role: 'STAFF',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      await expect(service.acceptInvite(USER_ID, 'someone-else@x.com', 'token')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.vendorMember.upsert).not.toHaveBeenCalled();
    });

    it('accepts a valid, matching invite: creates the membership and promotes CUSTOMER -> VENDOR', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        email: 'me@x.com',
        role: 'STAFF',
        consumedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await service.acceptInvite(USER_ID, 'ME@X.COM', 'token'); // case-insensitive match

      expect(tx.vendorStaffInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1' }, data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
      );
      expect(tx.vendorMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { vendorId: VENDOR_ID, userId: USER_ID, role: 'STAFF' },
        }),
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, role: 'CUSTOMER' },
        data: { role: 'VENDOR' },
      });
    });

    it('accepts a match with incidental whitespace on either side, not just case', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        email: '  me@x.com  ',
        role: 'STAFF',
        consumedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      // Doesn't reject with the "different email address" error — proves
      // the whitespace was normalized away, not just the casing.
      await service.acceptInvite(USER_ID, ' ME@X.COM ', 'token');
      expect(tx.vendorMember.upsert).toHaveBeenCalled();
    });

    it('rejects a revoked invite — same as an expired or already-consumed one', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        email: 'me@x.com',
        role: 'STAFF',
        consumedAt: null,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100_000),
      });
      await expect(service.acceptInvite(USER_ID, 'me@x.com', 'token')).rejects.toThrow(BadRequestException);
      expect(tx.vendorMember.upsert).not.toHaveBeenCalled();
    });

    it('two concurrent accept calls for the same invite do not create duplicate memberships — the loser of the race resolves to the winner\'s row instead of a 500', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        email: 'me@x.com',
        role: 'STAFF',
        consumedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      const existingMembership = { id: 'member-existing', vendorId: VENDOR_ID, userId: USER_ID, role: 'STAFF' };
      // Simulates the real-world race: both calls pass the pre-transaction
      // checks, then the second one's upsert hits a genuine unique-
      // constraint violation because the first one already committed.
      tx.vendorMember.upsert.mockRejectedValueOnce(prismaUniqueViolation());
      prisma.vendorMember.findUnique.mockResolvedValueOnce(existingMembership);

      const result = await service.acceptInvite(USER_ID, 'me@x.com', 'token');

      expect(result).toEqual(existingMembership);
    });
  });

  describe('revokeInvite', () => {
    it('marks a pending invite revoked', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        consumedAt: null,
        revokedAt: null,
      });
      await service.revokeInvite(OWNER_ID, 'inv-1');
      expect(prisma.vendorStaffInvite.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('requires OWNER — enforced via requireOwner, same as invite/updateRole/revoke', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({ id: 'inv-1', vendorId: VENDOR_ID, consumedAt: null, revokedAt: null });
      await service.revokeInvite(OWNER_ID, 'inv-1');
      expect(membership.requireOwner).toHaveBeenCalledWith(OWNER_ID);
    });

    it('404s on an invite belonging to a different vendor', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({ id: 'inv-1', vendorId: 'other-vendor', consumedAt: null, revokedAt: null });
      await expect(service.revokeInvite(OWNER_ID, 'inv-1')).rejects.toThrow(NotFoundException);
      expect(prisma.vendorStaffInvite.update).not.toHaveBeenCalled();
    });

    it('404s on an invite that does not exist', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue(null);
      await expect(service.revokeInvite(OWNER_ID, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects revoking an invite that was already accepted — revoke their membership instead', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        consumedAt: new Date(),
        revokedAt: null,
      });
      await expect(service.revokeInvite(OWNER_ID, 'inv-1')).rejects.toThrow(BadRequestException);
      expect(prisma.vendorStaffInvite.update).not.toHaveBeenCalled();
    });

    it('revoking an already-revoked invite is an idempotent no-op, not an error', async () => {
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        vendorId: VENDOR_ID,
        consumedAt: null,
        revokedAt: new Date(),
      });
      await expect(service.revokeInvite(OWNER_ID, 'inv-1')).resolves.toBeUndefined();
      expect(prisma.vendorStaffInvite.update).not.toHaveBeenCalled();
    });

    it('a revoked invite is immediately unacceptable — the same token now fails acceptInvite', async () => {
      const invite = { id: 'inv-1', vendorId: VENDOR_ID, email: 'me@x.com', role: 'STAFF', consumedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 100_000) };
      prisma.vendorStaffInvite.findUnique.mockResolvedValueOnce(invite); // for revokeInvite's own lookup
      await service.revokeInvite(OWNER_ID, 'inv-1');

      // Now simulate the accept call seeing the post-revocation row.
      prisma.vendorStaffInvite.findUnique.mockResolvedValue({ ...invite, revokedAt: new Date() });
      await expect(service.acceptInvite(USER_ID, 'me@x.com', 'token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('pending invite listing excludes revoked invites', () => {
    it('list() queries pendingInvites with revokedAt: null', async () => {
      prisma.vendorMember.findMany.mockResolvedValue([]);
      prisma.vendorStaffInvite.findMany.mockResolvedValue([]);
      await service.list(OWNER_ID);
      expect(prisma.vendorStaffInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ revokedAt: null, consumedAt: null }) }),
      );
    });
  });

  describe('last-owner protection', () => {
    it('revoke() rejects removing the only owner', async () => {
      prisma.vendorMember.findUnique.mockResolvedValue({ id: MEMBER_ID, vendorId: VENDOR_ID, role: 'OWNER' });
      prisma.vendorMember.count.mockResolvedValue(0); // no *other* owners
      await expect(service.revoke(OWNER_ID, MEMBER_ID)).rejects.toThrow(BadRequestException);
      expect(prisma.vendorMember.delete).not.toHaveBeenCalled();
    });

    it('revoke() allows removing an owner when another owner remains', async () => {
      prisma.vendorMember.findUnique.mockResolvedValue({ id: MEMBER_ID, vendorId: VENDOR_ID, role: 'OWNER' });
      prisma.vendorMember.count.mockResolvedValue(1); // one other owner exists
      await service.revoke(OWNER_ID, MEMBER_ID);
      expect(prisma.vendorMember.delete).toHaveBeenCalledWith({ where: { id: MEMBER_ID } });
    });

    it('revoke() allows removing STAFF unconditionally (no owner-count check needed)', async () => {
      prisma.vendorMember.findUnique.mockResolvedValue({ id: MEMBER_ID, vendorId: VENDOR_ID, role: 'STAFF' });
      await service.revoke(OWNER_ID, MEMBER_ID);
      expect(prisma.vendorMember.count).not.toHaveBeenCalled();
      expect(prisma.vendorMember.delete).toHaveBeenCalled();
    });

    it('updateRole() rejects demoting the only owner to STAFF', async () => {
      prisma.vendorMember.findUnique.mockResolvedValue({ id: MEMBER_ID, vendorId: VENDOR_ID, role: 'OWNER' });
      prisma.vendorMember.count.mockResolvedValue(0);
      await expect(service.updateRole(OWNER_ID, MEMBER_ID, 'STAFF' as never)).rejects.toThrow(BadRequestException);
    });

    it('cross-vendor denial: 404s on a member belonging to a different vendor', async () => {
      prisma.vendorMember.findUnique.mockResolvedValue({ id: MEMBER_ID, vendorId: 'other-vendor', role: 'STAFF' });
      await expect(service.revoke(OWNER_ID, MEMBER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
