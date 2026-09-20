import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const TARGET_ID = '00000000-0000-4000-a000-000000000002';
const SUPER_ADMIN_ID = '00000000-0000-4000-a000-000000000003';
const OTHER_SUPER_ADMIN_ID = '00000000-0000-4000-a000-000000000004';

function makeTxMock() {
  return {
    user: { update: jest.fn() },
    refreshTokenFamily: { updateMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('updateStatus', () => {
    it('refuses to let an admin suspend their own account', async () => {
      await expect(
        service.updateStatus(ADMIN_ID, UserStatus.SUSPENDED, { id: ADMIN_ID, role: Role.ADMIN }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to let a super admin suspend their own account', async () => {
      await expect(
        service.updateStatus(SUPER_ADMIN_ID, UserStatus.SUSPENDED, { id: SUPER_ADMIN_ID, role: Role.SUPER_ADMIN }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a user that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: ADMIN_ID, role: Role.ADMIN }),
      ).rejects.toThrow(NotFoundException);
    });

    describe.each([
      ['ADMIN', 'CUSTOMER', Role.ADMIN, Role.CUSTOMER, true],
      ['ADMIN', 'VENDOR', Role.ADMIN, Role.VENDOR, true],
      ['ADMIN', 'ADMIN', Role.ADMIN, Role.ADMIN, false],
      ['ADMIN', 'SUPER_ADMIN', Role.ADMIN, Role.SUPER_ADMIN, false],
      ['SUPER_ADMIN', 'CUSTOMER', Role.SUPER_ADMIN, Role.CUSTOMER, true],
      ['SUPER_ADMIN', 'VENDOR', Role.SUPER_ADMIN, Role.VENDOR, true],
      ['SUPER_ADMIN', 'ADMIN', Role.SUPER_ADMIN, Role.ADMIN, true],
    ])('actor %s, target %s', (_actorLabel, _targetLabel, actorRole, targetRole, shouldSucceed) => {
      it(shouldSucceed ? 'is allowed' : 'is forbidden', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: targetRole, status: UserStatus.ACTIVE });
        tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

        const attempt = service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: ADMIN_ID, role: actorRole });

        if (shouldSucceed) {
          await expect(attempt).resolves.toEqual({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });
        } else {
          await expect(attempt).rejects.toThrow(ForbiddenException);
          expect(prisma.$transaction).not.toHaveBeenCalled();
        }
      });
    });

    it('a super admin suspending another super admin is allowed when a third active super admin remains', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE });
      tx.$queryRaw.mockResolvedValue([{ id: TARGET_ID }, { id: OTHER_SUPER_ADMIN_ID }]);
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

      await expect(
        service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: SUPER_ADMIN_ID, role: Role.SUPER_ADMIN }),
      ).resolves.toEqual({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });
    });

    it('refuses to suspend the last active super admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE });
      tx.$queryRaw.mockResolvedValue([{ id: TARGET_ID }]);

      await expect(
        service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: SUPER_ADMIN_ID, role: Role.SUPER_ADMIN }),
      ).rejects.toThrow(BadRequestException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('locks active super admin rows with SELECT ... FOR UPDATE before deciding', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE });
      tx.$queryRaw.mockResolvedValue([{ id: TARGET_ID }, { id: OTHER_SUPER_ADMIN_ID }]);
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

      await service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: SUPER_ADMIN_ID, role: Role.SUPER_ADMIN });

      const [strings] = tx.$queryRaw.mock.calls[0];
      expect(strings.join('')).toContain('FOR UPDATE');
      expect(strings.join('')).toContain("role = 'SUPER_ADMIN'");
      expect(strings.join('')).toContain("status = 'ACTIVE'");
    });

    it('does not run the super admin lock query for a non-super-admin target', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.CUSTOMER, status: UserStatus.ACTIVE });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

      await service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: ADMIN_ID, role: Role.ADMIN });

      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('does not run the super admin lock query on reactivation', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.SUPER_ADMIN, status: UserStatus.SUSPENDED });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.ACTIVE });

      await service.updateStatus(TARGET_ID, UserStatus.ACTIVE, { id: SUPER_ADMIN_ID, role: Role.SUPER_ADMIN });

      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('suspending revokes every session in the same transaction as the status change', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.CUSTOMER, status: UserStatus.ACTIVE });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

      await service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, { id: ADMIN_ID, role: Role.ADMIN });

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TARGET_ID }, data: { status: UserStatus.SUSPENDED } }),
      );
      expect(tx.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { userId: TARGET_ID },
        data: { isRevoked: true },
      });
    });

    it('reactivating does NOT touch sessions (nothing to revoke)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, role: Role.CUSTOMER, status: UserStatus.SUSPENDED });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.ACTIVE });

      await service.updateStatus(TARGET_ID, UserStatus.ACTIVE, { id: ADMIN_ID, role: Role.ADMIN });

      expect(tx.refreshTokenFamily.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('paginates and never selects passwordHash', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.list(2, 10);

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
      expect(call.select.passwordHash).toBeUndefined();
    });
  });
});
