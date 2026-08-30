import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const TARGET_ID = '00000000-0000-4000-a000-000000000002';

function makeTxMock() {
  return {
    user: { update: jest.fn() },
    refreshTokenFamily: { updateMany: jest.fn() },
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
      await expect(service.updateStatus(ADMIN_ID, UserStatus.SUSPENDED, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a user that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('suspending revokes every session in the same transaction as the status change', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, status: UserStatus.ACTIVE });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.SUSPENDED });

      await service.updateStatus(TARGET_ID, UserStatus.SUSPENDED, ADMIN_ID);

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TARGET_ID }, data: { status: UserStatus.SUSPENDED } }),
      );
      expect(tx.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
        where: { userId: TARGET_ID },
        data: { isRevoked: true },
      });
    });

    it('reactivating does NOT touch sessions (nothing to revoke)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID, status: UserStatus.SUSPENDED });
      tx.user.update.mockResolvedValue({ id: TARGET_ID, email: 'x@y.com', status: UserStatus.ACTIVE });

      await service.updateStatus(TARGET_ID, UserStatus.ACTIVE, ADMIN_ID);

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
