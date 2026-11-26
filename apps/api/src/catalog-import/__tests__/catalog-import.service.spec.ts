import { ConfigService } from '@nestjs/config';
import { CatalogImportService } from '../catalog-import.service';
import { CatalogSource } from '@prisma/client';
import { SupplierProduct } from '../catalog-source.adapter';
const source = CatalogSource.OPEN_FOOD_FACTS;
const candidate = (id: string): SupplierProduct => ({
  externalId: id,
  name: `Product ${id}`,
  description: 'Supplier product description',
  categoryName: 'Snacks',
  imageUrls: ['https://images.openfoodfacts.org/a.jpg', 'https://images.openfoodfacts.org/b.jpg'],
  imageCount: 2,
  specifications: { Ingredients: 'Oats' },
  brand: 'Test brand',
});
function setup() {
  const run: Record<string, any> = {
    id: 'run',
    source,
    status: 'QUEUED',
    processedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    categoryScope: ['en:snacks'],
  };
  const db: any = {
    catalogImportPreview: {
      create: jest.fn(async ({ data }) => ({ ...data, id: 'preview' })),
      findUnique: jest.fn(),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    catalogSourceCheckpoint: { findUnique: jest.fn(async () => null), upsert: jest.fn() },
    catalogImportRun: {
      create: jest.fn(async ({ data }) => ({ ...data, id: 'run' })),
      findUniqueOrThrow: jest.fn(async () => ({ ...run })),
      update: jest.fn(async ({ data }) => {
        for (const [k, v] of Object.entries(data))
          run[k] =
            typeof v === 'object' && v && 'increment' in v
              ? (run[k] ?? 0) + (v as any).increment
              : v;
        return { ...run };
      }),
    },
    productSource: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
    },
    product: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'product' })),
    },
    category: {
      findUnique: jest.fn(async () => ({
        id: 'category',
        name: 'Snacks',
        slug: 'snacks-sweets',
        isActive: true,
        parentId: null,
      })),
      findMany: jest.fn(async () => [
        { id: 'category', name: 'Snacks', slug: 'snacks-sweets', isActive: true, parentId: null },
      ]),
      upsert: jest.fn(async () => ({ id: 'category' })),
    },
    brand: { upsert: jest.fn(async () => ({ id: 'brand' })) },
    attributeDefinition: { upsert: jest.fn(async () => ({ id: 'attribute' })) },
    productAttributeValue: { upsert: jest.fn() },
    productMedia: { createMany: jest.fn() },
    vendorOffer: { create: jest.fn(async () => ({ id: 'offer' })) },
    inventoryAdjustment: { create: jest.fn() },
    vendor: { findMany: jest.fn(async () => [{ id: 'vendor', name: 'ShopNest Direct' }]) },
    taxClass: { findUnique: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => [{ acquired: true }]),
  };
  db.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(db));
  const adapter = {
    fetchProducts: jest.fn(async () => ({
      products: [candidate('a'), candidate('b')],
      skippedCount: 0,
      exhausted: true,
    })),
  };
  const images = {
    ingest: jest.fn(async (urls: string[]) =>
      urls.map((_, i) => `http://localhost:3001/uploads/${i}.jpg`),
    ),
  };
  const values: Record<string, unknown> = {
    'app.catalogImportEnabled': true,
    'app.nodeEnv': 'test',
    'app.catalogImportBatchSize': 1,
  };
  const config = {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as ConfigService;
  const service = new CatalogImportService(
    db,
    { resolve: () => adapter } as never,
    config,
    images as never,
  );
  return { db, run, adapter, images, service, values };
}
describe('saved catalog imports and incremental discovery', () => {
  it('does not fetch a supplier taxonomy when this import has an explicit category override', async () => {
    const { adapter, service } = setup();
    const taxonomy = jest.fn(async () => {
      throw new Error('Taxonomy unavailable');
    });
    Object.assign(adapter, { categoryTaxonomy: taxonomy });
    const preview = await service.preview(source, { maxRecords: 1, targetCategoryId: 'category' });
    expect(preview.wouldCreateCount).toBe(1);
    expect(taxonomy).not.toHaveBeenCalled();
  });
  it('holds unmapped supplier categories for review without validating their photos or creating categories', async () => {
    const { db, adapter, images, service } = setup();
    const unknown = {
      ...candidate('a'),
      categoryName: 'Unknown supplier category',
      sourceCategoryIds: ['en:unknown'],
    };
    const unknown2 = { ...unknown, externalId: 'b' };
    adapter.fetchProducts.mockResolvedValue({
      products: [unknown, unknown2],
      skippedCount: 0,
      exhausted: true,
    });
    const preview = await service.preview(source, { maxRecords: 2 });
    expect(preview).toMatchObject({ wouldCreateCount: 0, unmappedCount: 2, skippedCount: 2 });
    expect(images.ingest).not.toHaveBeenCalled();
    expect(db.category.upsert).not.toHaveBeenCalled();
  });
  it('requires a fresh review if the internal category becomes unavailable', async () => {
    const { db, service } = setup();
    await service.preview(source, { maxRecords: 1 });
    db.catalogImportPreview.findUnique.mockResolvedValue({
      id: 'preview',
      status: 'READY',
      source,
      expiresAt: new Date(Date.now() + 60000),
      products: db.catalogImportPreview.create.mock.calls[0][0].data.products,
    });
    db.category.findMany.mockResolvedValue([]);
    await expect(service.enqueue(source, { maxRecords: 1, previewId: 'preview' })).rejects.toThrow(
      'Category mappings changed',
    );
    expect(db.catalogImportRun.create).not.toHaveBeenCalled();
  });
  it('uses the source/category/version checkpoint and requests additional eligible products past duplicates', async () => {
    const { db, adapter, service } = setup();
    db.catalogSourceCheckpoint.findUnique.mockResolvedValue({ position: 7 });
    db.productSource.findMany
      .mockResolvedValueOnce([{ externalId: 'a' }, { externalId: 'b' }])
      .mockResolvedValue([]);
    adapter.fetchProducts
      .mockResolvedValueOnce({
        products: [candidate('a'), candidate('b')],
        skippedCount: 0,
        exhausted: false,
      })
      .mockResolvedValueOnce({ products: [candidate('c')], skippedCount: 0, exhausted: true });
    const preview = await service.preview(source, { categoryScope: ['en:snacks'], maxRecords: 1 });
    expect(adapter.fetchProducts.mock.calls.map((args: any) => args[0].page)).toEqual([7, 8]);
    expect(preview).toMatchObject({
      wouldCreateCount: 1,
      wouldBeUnchangedCount: 2,
      discoveredCount: 3,
    });
    expect(preview.sample[0].externalId).toBe('c');
    expect(db.catalogSourceCheckpoint.upsert).not.toHaveBeenCalled();
  });
  it('validates images before preview and saves exact proposed prices, stock and vendors', async () => {
    const { db, images, service } = setup();
    const scope = { maxRecords: 1, demoPriceCents: 12345, demoStockQuantity: 17, minImageCount: 2 };
    const preview = await service.preview(source, scope);
    expect(images.ingest).toHaveBeenCalled();
    expect(preview.sample[0]).toMatchObject({
      imageCount: 2,
      proposedOffer: { vendorId: 'vendor', priceCents: 12345, stockQuantity: 17 },
    });
    expect(
      db.catalogImportPreview.create.mock.calls[0][0].data.products.products[0].imageUrls[0],
    ).toContain('/uploads/');
  });
  it('excludes cross-source GTIN matches without fuzzy title merging', async () => {
    const { db, adapter, service } = setup();
    adapter.fetchProducts.mockResolvedValue({
      products: [{ ...candidate('a'), gtin: '00012345678901' }],
      skippedCount: 0,
      exhausted: true,
    });
    db.product.findMany.mockResolvedValue([{ gtin: '00012345678901' }]);
    expect(await service.preview(source, { maxRecords: 1 })).toMatchObject({
      wouldCreateCount: 0,
      wouldBeUnchangedCount: 1,
      exhausted: true,
    });
  });
  it('allows a deliberate rescan after changing quality filters', async () => {
    const { db, adapter, service } = setup();
    await service.preview(source, { categoryScope: ['en:snacks'], rescan: true, maxRecords: 1 });
    expect(db.catalogSourceCheckpoint.findUnique).not.toHaveBeenCalled();
    expect(adapter.fetchProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
  it('binds the full configuration and imports only the selected saved candidates', async () => {
    const { db, service } = setup();
    const scope = { maxRecords: 2, demoPriceCents: 1000, demoStockQuantity: 10 };
    await service.preview(source, scope);
    db.catalogImportPreview.findUnique.mockResolvedValue({
      id: 'preview',
      status: 'READY',
      source,
      expiresAt: new Date(Date.now() + 60000),
      products: db.catalogImportPreview.create.mock.calls[0][0].data.products,
    });
    await expect(
      service.enqueue(source, { ...scope, demoPriceCents: 2000, previewId: 'preview' }),
    ).rejects.toThrow('Configuration changed');
    await service.enqueue(source, { ...scope, previewId: 'preview', selectedProductIds: ['b'] });
    expect(
      db.catalogImportRun.create.mock.calls[0][0].data.candidateSnapshot.products.map(
        (p: any) => p.externalId,
      ),
    ).toEqual(['b']);
    expect(db.catalogImportRun.create.mock.calls[0][0].data.scopedCount).toBe(1);
    expect(db.catalogImportPreview.deleteMany).toHaveBeenCalledTimes(1);
  });
  it('rejects expired or previously consumed previews', async () => {
    const { db, service } = setup();
    db.catalogImportPreview.findUnique.mockResolvedValue(null);
    await expect(service.enqueue(source, { previewId: 'missing' })).rejects.toThrow(
      'Preview expired',
    );
    expect(db.catalogImportRun.create).not.toHaveBeenCalled();
  });
  it('never fetches from a source while executing a confirmed snapshot', async () => {
    const { db, run, adapter, service } = setup();
    run.candidateSnapshot = {
      products: [candidate('a')],
      checkpoints: [{ category: 'en:snacks', version: 'v1', position: 2, exhausted: false }],
    };
    await service.executeRun('run');
    expect(adapter.fetchProducts).not.toHaveBeenCalled();
    expect(db.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ publishStatus: 'DRAFT', brandId: 'brand' }),
    });
    expect(db.productAttributeValue.upsert).toHaveBeenCalled();
    expect(db.category.upsert).not.toHaveBeenCalled();
    expect(db.catalogSourceCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { position: 2, exhausted: false } }),
    );
  });
  it('uses insert-only writes and leaves existing descriptions, images, offers and stock untouched', async () => {
    const { db, run, service } = setup();
    run.candidateSnapshot = { products: [candidate('a')], checkpoints: [] };
    db.productSource.findUnique.mockResolvedValue({ productId: 'existing' });
    await service.executeRun('run');
    expect(db.product.create).not.toHaveBeenCalled();
    expect(db.productMedia.createMany).not.toHaveBeenCalled();
    expect(db.vendorOffer.create).not.toHaveBeenCalled();
    expect(run.unchangedCount).toBe(1);
  });
  it('resumes from the last committed batch without double-counting', async () => {
    const { db, run, service } = setup();
    run.processedCount = 1;
    run.createdCount = 1;
    run.candidateSnapshot = { products: [candidate('a'), candidate('b')], checkpoints: [] };
    await service.executeRun('run');
    expect(db.product.create).toHaveBeenCalledTimes(1);
    expect(run.processedCount).toBe(2);
    expect(run.createdCount).toBe(2);
    await service.executeRun('run');
    expect(db.product.create).toHaveBeenCalledTimes(1);
  });
  it('retains a partial page so records beyond a requested quantity remain reachable', async () => {
    const { db, service } = setup();
    await service.preview(source, { maxRecords: 1 });
    expect(
      db.catalogImportPreview.create.mock.calls[0][0].data.products.checkpoints[0],
    ).toMatchObject({ position: 1, exhausted: false });
  });
  it('bounds scans even when a source keeps returning duplicates', async () => {
    const { db, adapter, service } = setup();
    adapter.fetchProducts.mockResolvedValue({
      products: [candidate('a')],
      skippedCount: 0,
      exhausted: false,
    });
    db.productSource.findMany.mockResolvedValue([{ externalId: 'a' }]);
    const result = await service.preview(source, { maxRecords: 1 });
    expect(result.scanLimitReached).toBe(true);
    expect(adapter.fetchProducts).toHaveBeenCalledTimes(30);
  });
});
