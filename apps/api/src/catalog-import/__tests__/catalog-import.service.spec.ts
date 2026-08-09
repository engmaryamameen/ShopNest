import { CatalogImportStatus, CatalogSource } from '@prisma/client';
import { CatalogImportService } from '../catalog-import.service';
import { CatalogSourceAdapter } from '../catalog-source.adapter';

const supplierProduct = {
  externalId: '7',
  name: 'Mechanical Keyboard',
  description: 'A durable mechanical keyboard.',
  categoryName: 'Computer Accessories',
  priceCents: 4995,
  stockQuantity: 12,
};

function makePrismaMock() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
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
  it('creates a canonical product and records successful counts', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue([supplierProduct]),
    };
    const service = new CatalogImportService(prisma as never, adapter);

    const queued = await service.enqueueDummyJson();
    const result = await service.executeRun(queued.id);

    expect(prisma.tx.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.productSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: CatalogSource.DUMMY_JSON, externalId: '7' }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: CatalogImportStatus.SUCCEEDED,
        discoveredCount: 1,
        createdCount: 1,
      }),
    );
  });

  it('does not rewrite an unchanged canonical product', async () => {
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
    expect(result).toEqual(expect.objectContaining({ unchangedCount: 1, createdCount: 0 }));
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
