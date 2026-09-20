import { NotFoundException } from '@nestjs/common';
import { AddressesService } from '../addresses.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_ID = 'user-1';
const ADDRESS_ID = 'address-1';

function makeTxMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    address: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    address: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

describe('AddressesService', () => {
  let service: AddressesService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    service = new AddressesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('makes the first address default automatically', async () => {
      tx.address.count.mockResolvedValue(0);
      await service.create(USER_ID, {} as never);
      expect(tx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
      );
    });

    it('does not touch isDefault for a second address', async () => {
      tx.address.count.mockResolvedValue(1);
      await service.create(USER_ID, {} as never);
      expect(tx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }),
      );
    });

    it('locks the user row set before counting — same discipline as setDefault', async () => {
      tx.address.count.mockResolvedValue(0);
      await service.create(USER_ID, {} as never);
      expect(tx.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('ownership', () => {
    it('update() 404s on an address belonging to a different user', async () => {
      prisma.address.findUnique.mockResolvedValue({ id: ADDRESS_ID, userId: 'someone-else' });
      await expect(service.update(USER_ID, ADDRESS_ID, {} as never)).rejects.toThrow(NotFoundException);
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('remove() 404s on an address that does not exist', async () => {
      prisma.address.findUnique.mockResolvedValue(null);
      await expect(service.remove(USER_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setDefault', () => {
    it('404s on an address belonging to a different user', async () => {
      tx.address.findUnique.mockResolvedValue({ id: ADDRESS_ID, userId: 'someone-else' });
      await expect(service.setDefault(USER_ID, ADDRESS_ID)).rejects.toThrow(NotFoundException);
      expect(tx.address.updateMany).not.toHaveBeenCalled();
    });

    it('unsets every other default before setting the new one, inside the locked transaction', async () => {
      tx.address.findUnique.mockResolvedValue({ id: ADDRESS_ID, userId: USER_ID });
      await service.setDefault(USER_ID, ADDRESS_ID);

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.address.update).toHaveBeenCalledWith({ where: { id: ADDRESS_ID }, data: { isDefault: true } });
    });
  });
});
