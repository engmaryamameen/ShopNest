import { CatalogImportStatus, CatalogSource } from '@prisma/client';
import { CatalogImportService } from '../catalog-import.service';
import { CatalogSourceAdapter } from '../catalog-source.adapter';

const SYSTEM_VENDOR_ID = 'system-vendor-id';

const supplierProduct = {
  externalId: '7',
  name: 'Mechanical Keyboard',
  description: 'A durable mechanical keyboard.',
  categoryName: 'Computer Accessories',
  priceCents: 4995,
  stockQuantity: 12,
  imageUrl: 'https://cdn.example.com/keyboard.jpg',
};

function makePrismaMock() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
    vendor: { upsert: jest.fn().mockResolvedValue({ id: SYSTEM_VENDOR_ID }) },
    productSource: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    category: { upsert: jest.fn().mockResolvedValue({ id: 'category-id' }) },
    product: {
      create: jest.fn().mockResolvedValue({ id: 'product-id' }),
      update: jest.fn().mockResolvedValue({}),
    },
    productMedia: { upsert: jest.fn().mockResolvedValue({}) },
    vendorOffer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'offer-id' }),
      update: jest.fn().mockResolvedValue({}),
    },
    inventoryAdjustment: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    tx,
    catalogImportRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-id', status: CatalogImportStatus.QUEUED }),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'run-id', ...data })),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(tx)),
  };
}

describe('CatalogImportService', () => {
  it('creates a canonical product, its image, and a system-vendor VendorOffer — never writes Product commercial fields as the source of truth', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue([supplierProduct]),
    };
    const service = new CatalogImportService(prisma as never, adapter);

    const queued = await service.enqueueDummyJson();
    const result = await service.executeRun(queued.id);

    expect(prisma.tx.vendor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'shopnest-direct' } }),
    );
    expect(prisma.tx.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.productSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: CatalogSource.DUMMY_JSON, externalId: '7' }),
    });
    expect(prisma.tx.productMedia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ url: supplierProduct.imageUrl, position: 0 }) }),
    );
    expect(prisma.tx.vendorOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: SYSTEM_VENDOR_ID,
          productId: 'product-id',
          priceCents: 4995,
          stockQuantity: 12,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.tx.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorOfferId: 'offer-id', delta: 12, reason: 'IMPORT_INITIAL' }) }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: CatalogImportStatus.SUCCEEDED,
        discoveredCount: 1,
        createdCount: 1,
      }),
    );
  });

  it('does not rewrite an unchanged canonical product or its offer', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue([supplierProduct]),
    };
    const service = new CatalogImportService(prisma as never, adapter);

    await service.executeRun('run-id');
    const checksum = prisma.tx.productSource.create.mock.calls[0][0].data.checksum;
    prisma.tx.productSource.findUnique.mockResolvedValue({
      id: 'source-id',
      productId: 'product-id',
      checksum,
    });
    const result = await service.executeRun('run-id');

    expect(prisma.tx.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.vendorOffer.create).toHaveBeenCalledTimes(1); // not called again on the unchanged run
    expect(result).toEqual(expect.objectContaining({ unchangedCount: 1, createdCount: 0 }));
  });

  it('re-syncing an existing offer with a changed stock quantity records the delta, not a fresh IMPORT_INITIAL row', async () => {
    const prisma = makePrismaMock();
    prisma.tx.productSource.findUnique.mockResolvedValue({
      id: 'source-id',
      productId: 'product-id',
      checksum: 'stale-checksum-so-it-looks-changed',
    });
    prisma.tx.vendorOffer.findFirst.mockResolvedValue({ id: 'offer-id', stockQuantity: 5 });

    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue([{ ...supplierProduct, stockQuantity: 20 }]),
    };
    const service = new CatalogImportService(prisma as never, adapter);
    await service.executeRun('run-id');

    expect(prisma.tx.vendorOffer.create).not.toHaveBeenCalled();
    expect(prisma.tx.vendorOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stockQuantity: 20 }) }),
    );
    expect(prisma.tx.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: 15, reason: 'CORRECTION' }) }), // 20 - 5
    );
  });

  it('leaves retry and terminal failure policy to the worker', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const service = new CatalogImportService(prisma as never, adapter);

    await expect(service.executeRun('run-id')).rejects.toThrow('offline');
    expect(prisma.catalogImportRun.update).not.toHaveBeenCalled();
  });
});
