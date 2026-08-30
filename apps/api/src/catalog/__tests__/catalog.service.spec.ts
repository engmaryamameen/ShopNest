import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogService } from '../catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

const CATEGORY_ID = '00000000-0000-4000-a000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-a000-000000000002';
const SYSTEM_VENDOR_ID = '00000000-0000-4000-a000-000000000099';

function prismaUniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.10.1',
  });
}

function makeTxMock() {
  return {
    category: { findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), count: jest.fn() },
    product: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn() },
    productMedia: { create: jest.fn() },
    vendor: { findUnique: jest.fn() },
    vendorOffer: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    inventoryAdjustment: { create: jest.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    brand: { findMany: jest.fn(), findUnique: jest.fn() },
    vendor: { findUnique: jest.fn().mockResolvedValue({ id: SYSTEM_VENDOR_ID }) },
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
        data: { name: 'Home & Garden', slug: 'home-garden', parentId: null },
      });
    });

    it('appends a numeric suffix when the derived slug already exists', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'existing', slug: 'books' }) // "books" taken
        .mockResolvedValueOnce(null); // "books-2" free
      prisma.category.create.mockResolvedValue({ id: CATEGORY_ID, name: 'Books', slug: 'books-2' });

      await service.createCategory({ name: 'Books' } as never);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Books', slug: 'books-2', parentId: null },
      });
    });

    it('translates a Prisma unique-constraint race into a 409 ConflictException', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockRejectedValue(prismaUniqueViolation());

      await expect(service.createCategory({ name: 'Books' } as never)).rejects.toThrow(ConflictException);
    });

    it('rejects a category pointed at a parent that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null); // parent lookup fails

      await expect(
        service.createCategory({ name: 'Laptops', parentId: 'missing-parent' } as never),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    it('rejects an update with no fields provided', async () => {
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

    it('rejects setting a category as its own parent', async () => {
      await expect(
        service.updateCategory(CATEGORY_ID, { parentId: CATEGORY_ID } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects moving a category under one of its own descendants (cycle prevention)', async () => {
      const CHILD_ID = 'child-cat';
      prisma.category.findUnique.mockResolvedValueOnce({ id: CHILD_ID }); // ensureCategoryExists(parentId)
      // getDescendantCategoryIds(CATEGORY_ID) walks children — CHILD_ID is one of them
      prisma.category.findMany
        .mockResolvedValueOnce([{ id: CHILD_ID }])
        .mockResolvedValueOnce([]);

      await expect(
        service.updateCategory(CATEGORY_ID, { parentId: CHILD_ID } as never),
      ).rejects.toThrow(BadRequestException);
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
      tx.category.count.mockResolvedValue(0);

      await expect(service.deleteCategory(CATEGORY_ID)).rejects.toThrow(ConflictException);
      expect(tx.category.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a category that still has subcategories', async () => {
      tx.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
      tx.product.count.mockResolvedValue(0);
      tx.category.count.mockResolvedValue(2);

      await expect(service.deleteCategory(CATEGORY_ID)).rejects.toThrow(ConflictException);
      expect(tx.category.delete).not.toHaveBeenCalled();
    });

    it('deletes the category once it has zero referencing products and zero children', async () => {
      tx.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
      tx.product.count.mockResolvedValue(0);
      tx.category.count.mockResolvedValue(0);
      tx.category.delete.mockResolvedValue(undefined);

      await service.deleteCategory(CATEGORY_ID);

      expect(tx.category.delete).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
    });
  });

  describe('createProduct', () => {
    it('rejects a product pointed at a category that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createProduct({ name: 'Widget', categoryId: 'missing-cat', priceCents: 100, stockQuantity: 1 } as never),
      ).rejects.toThrow(NotFoundException);
      expect(tx.product.create).not.toHaveBeenCalled();
    });

    it('creates the canonical Product and a system-vendor VendorOffer in the same transaction', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
      tx.product.create.mockResolvedValue({ id: PRODUCT_ID, slug: 'widget' });
      tx.vendorOffer.create.mockResolvedValue({ id: 'offer-1' });
      tx.product.findUniqueOrThrow.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Widget',
        slug: 'widget',
        description: 'desc',
        categoryId: CATEGORY_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: CATEGORY_ID, name: 'Cat', slug: 'cat' },
        brand: null,
        media: [],
        offers: [],
      });

      await service.createProduct({
        name: 'Widget',
        categoryId: CATEGORY_ID,
        description: 'desc',
        priceCents: 999,
        stockQuantity: 5,
      } as never);

      // Product itself never receives commercial fields — those go only to
      // the VendorOffer created alongside it (assertion below).
      expect(tx.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ priceCents: expect.anything() }) }),
      );
      expect(tx.vendorOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vendorId: SYSTEM_VENDOR_ID, productId: PRODUCT_ID, priceCents: 999, stockQuantity: 5 }),
        }),
      );
      // Non-zero initial stock gets a matching InventoryAdjustment — the
      // "every stock mutation has an audit row" invariant.
      expect(tx.inventoryAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vendorOfferId: 'offer-1', delta: 5 }) }),
      );
    });
  });

  describe('listProducts', () => {
    it('returns an empty page (no query) for an unknown category slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      const result = await service.listProducts({ category: 'does-not-exist' } as never);

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('scopes the default listing to published products with at least one active offer', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.listProducts({} as never);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publishStatus: 'PUBLISHED',
            offers: { some: { status: 'ACTIVE' } },
          }),
        }),
      );
    });

    it('filters by every descendant of the requested category, not just an exact id match', async () => {
      const PARENT_ID = 'parent-cat';
      const CHILD_ID = 'child-cat';
      prisma.category.findUnique.mockResolvedValue({ id: PARENT_ID, slug: 'electronics' });
      prisma.category.findMany
        .mockResolvedValueOnce([{ id: CHILD_ID }]) // one child of parent
        .mockResolvedValueOnce([]); // no grandchildren
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.listProducts({ category: 'electronics' } as never);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: { in: [PARENT_ID, CHILD_ID] } }) }),
      );
    });
  });

  describe('archiveProduct', () => {
    it('throws NotFoundException for a product that does not exist', async () => {
      tx.product.findUnique.mockResolvedValue(null);
      await expect(service.archiveProduct('missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-archives the product and deactivates every one of its offers (never a physical delete)', async () => {
      tx.product.findUnique.mockResolvedValue({ id: 'p1' });
      tx.product.update.mockResolvedValue(undefined);
      tx.vendorOffer.updateMany.mockResolvedValue({ count: 1 });

      await service.archiveProduct('p1');

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { publishStatus: 'ARCHIVED' },
      });
      expect(tx.vendorOffer.updateMany).toHaveBeenCalledWith({
        where: { productId: 'p1' },
        data: { status: 'INACTIVE' },
      });
    });
  });

  describe('searchForListing (vendor offer-picker search)', () => {
    // "Offer-unfiltered" means unfiltered by *offer existence* — a vendor
    // can find a product nobody (or every other vendor) is already selling.
    // It must never mean unfiltered by publication/access rules: an
    // unpublished, archived, or otherwise-ineligible product must not be
    // listable by any vendor just because they searched for it.
    it('only queries PUBLISHED products — DRAFT and ARCHIVED are structurally excluded from the WHERE clause', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.searchForListing('lamp');

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ publishStatus: 'PUBLISHED' }),
        }),
      );
    });

    it('does not filter by offer existence at all — the whole point is finding products nobody (or another vendor) is already selling', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.searchForListing('lamp');

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('offers');
      expect(where).not.toHaveProperty('vendorOffers');
    });

    it('caps the requested limit at 25 and floors it at 1, never trusting the caller\'s raw value', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.searchForListing('lamp', 1000);
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));

      await service.searchForListing('lamp', -5);
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    });

    it('never selects Product fields that would leak commercial data — canonical fields only', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.searchForListing('lamp');

      const select = prisma.product.findMany.mock.calls[0][0].select;
      expect(Object.keys(select).sort()).toEqual(['category', 'id', 'name', 'slug', 'variants'].sort());
    });
  });
});
