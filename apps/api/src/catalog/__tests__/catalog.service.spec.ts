import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogService } from '../catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

const CATEGORY_ID = '00000000-0000-4000-a000-000000000001';

function prismaUniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.10.1',
  });
}

function makeTxMock() {
  return {
    category: { findUnique: jest.fn(), delete: jest.fn() },
    product: { count: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    $queryRaw: jest.fn(),
  };
}

describe('CatalogService', () => {
  let service: CatalogService;
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);

    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('createCategory', () => {
    it('slugifies the name when no slug is provided', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({ id: CATEGORY_ID, name: 'Home & Garden', slug: 'home-garden' });

      await service.createCategory({ name: 'Home & Garden' } as never);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Home & Garden', slug: 'home-garden' },
      });
    });

    it('appends a numeric suffix when the derived slug already exists', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'existing', slug: 'books' }) // "books" taken
        .mockResolvedValueOnce(null); // "books-2" free
      prisma.category.create.mockResolvedValue({ id: CATEGORY_ID, name: 'Books', slug: 'books-2' });

      await service.createCategory({ name: 'Books' } as never);

      expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Books', slug: 'books-2' } });
    });

    it('translates a Prisma unique-constraint race into a 409 ConflictException', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockRejectedValue(prismaUniqueViolation());

      await expect(service.createCategory({ name: 'Books' } as never)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateCategory', () => {
    it('rejects an update with neither name nor slug provided', async () => {
      await expect(service.updateCategory(CATEGORY_ID, {} as never)).rejects.toThrow(BadRequestException);
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.updateCategory(CATEGORY_ID, { name: 'New name' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not silently auto-change the slug when only the name changes (stable URLs)', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: CATEGORY_ID, name: 'Old', slug: 'old-slug' });
      prisma.category.update.mockResolvedValue({ id: CATEGORY_ID, name: 'New', slug: 'old-slug' });

      await service.updateCategory(CATEGORY_ID, { name: 'New' } as never);

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID },
        data: { name: 'New' },
      });
    });
  });

  describe('deleteCategory', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      tx.category.findUnique.mockResolvedValue(null);
      await expect(service.deleteCategory(CATEGORY_ID)).rejects.toThrow(NotFoundException);
      expect(tx.category.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a category that still has products (atomically, inside one transaction)', async () => {
      tx.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
      tx.product.count.mockResolvedValue(3);

      await expect(service.deleteCategory(CATEGORY_ID)).rejects.toThrow(ConflictException);
      expect(tx.category.delete).not.toHaveBeenCalled();
    });

    it('deletes the category once it has zero referencing products', async () => {
      tx.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
      tx.product.count.mockResolvedValue(0);
      tx.category.delete.mockResolvedValue(undefined);

      await service.deleteCategory(CATEGORY_ID);

      expect(tx.category.delete).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
    });
  });

  describe('createProduct', () => {
    it('rejects a product pointed at a category that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createProduct({ name: 'Widget', categoryId: 'missing-cat' } as never),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('listProducts', () => {
    it('returns an empty page (no query) for an unknown category slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      const result = await service.listProducts({ category: 'does-not-exist' } as never);

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('always scopes the default listing path to isActive products only', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.listProducts({} as never);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      );
    });
  });

  describe('archiveProduct', () => {
    it('throws NotFoundException for a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.archiveProduct('missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes by setting isActive to false — never a physical delete', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
      prisma.product.update.mockResolvedValue(undefined);

      await service.archiveProduct('p1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: false },
      });
    });
  });
});
