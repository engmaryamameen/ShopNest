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
  imageCount: 3,
};

/** A real accumulating in-memory row, shared between the top-level
 * `prisma.catalogImportRun` and every `tx.catalogImportRun` seen inside a
 * `$transaction` callback — exactly like a real Postgres row is the same
 * row regardless of which connection/transaction touches it. Understands
 * Prisma's `{ increment: N }` update operator so checkpoint math
 * (processedCount, createdCount, ...) behaves like the real thing across
 * multiple batches and multiple `executeRun` calls (retries/resumes). */
function makeRunStore(overrides: Record<string, unknown> = {}) {
  let row: Record<string, unknown> = {
    id: 'run-id',
    status: CatalogImportStatus.QUEUED,
    discoveredCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    scopedCount: 0,
    processedCount: 0,
    skippedCount: 0,
    categoryScope: [],
    maxRecords: null,
    minImageCount: null,
    errorMessage: null,
    lockedAt: null,
    lockedBy: null,
    completedAt: null,
    ...overrides,
  };

  function applyData(data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as Record<string, unknown>)) {
        row[key] = (Number(row[key]) || 0) + Number((value as { increment: number }).increment);
      } else {
        row[key] = value;
      }
    }
  }

  const update = jest.fn((args: { data: Record<string, unknown> }) => {
    applyData(args.data);
    return Promise.resolve({ ...row });
  });
  const findUniqueOrThrow = jest.fn(() => Promise.resolve({ ...row }));

  return { snapshot: () => ({ ...row }), update, findUniqueOrThrow };
}

function makePrismaMock(runOverrides: Record<string, unknown> = {}) {
  const runStore = makeRunStore(runOverrides);

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
    // Same store, same jest.fn()s, as the top-level catalogImportRun below —
    // a batch's checkpoint update inside a transaction and a read outside
    // one see the same row, exactly like a real Postgres table would.
    catalogImportRun: { update: runStore.update, findUniqueOrThrow: runStore.findUniqueOrThrow },
  };
  return {
    tx,
    runStore,
    // Read directly by preview() — no transaction, since nothing is written.
    productSource: { findUnique: jest.fn().mockResolvedValue(null) },
    catalogImportRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-id', status: CatalogImportStatus.QUEUED }),
      update: runStore.update,
      findMany: jest.fn(),
      findUniqueOrThrow: runStore.findUniqueOrThrow,
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
}

/** Batch size is injected via ConfigService — large by default so the
 * "ordinary behavior" tests exercise a single batch and keep their
 * assertions simple; the dedicated batching/checkpointing suite below
 * overrides it to a small number specifically to force multiple batches. */
function makeConfigMock(batchSize = 100) {
  return { get: jest.fn(() => batchSize) } as never;
}

describe('CatalogImportService', () => {
  it('creates a canonical product, its image, and a system-vendor VendorOffer — never writes Product commercial fields as the source of truth', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct], skippedCount: 0 }),
    };
    const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

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
        processedCount: 1,
      }),
    );
  });

  it('does not rewrite an unchanged canonical product or its offer', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct], skippedCount: 0 }),
    };
    const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

    await service.executeRun('run-id');
    const checksum = prisma.tx.productSource.create.mock.calls[0][0].data.checksum;
    prisma.tx.productSource.findUnique.mockResolvedValue({
      id: 'source-id',
      productId: 'product-id',
      checksum,
    });
    // A fresh run row for the second execution — a genuinely new
    // CatalogImportRun, not a resume of the first (that's covered
    // separately below).
    const prisma2 = makePrismaMock();
    prisma2.tx.productSource.findUnique.mockResolvedValue({ id: 'source-id', productId: 'product-id', checksum });
    const service2 = new CatalogImportService(prisma2 as never, adapter, makeConfigMock());
    const result = await service2.executeRun('run-id-2');

    expect(prisma2.tx.product.create).not.toHaveBeenCalled();
    expect(prisma2.tx.vendorOffer.create).not.toHaveBeenCalled();
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
      fetchProducts: jest.fn().mockResolvedValue({ products: [{ ...supplierProduct, stockQuantity: 20 }], skippedCount: 0 }),
    };
    const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());
    await service.executeRun('run-id');

    expect(prisma.tx.vendorOffer.create).not.toHaveBeenCalled();
    expect(prisma.tx.vendorOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stockQuantity: 20 }) }),
    );
    expect(prisma.tx.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: 15, reason: 'CORRECTION' }) }), // 20 - 5
    );
  });

  it('leaves retry and terminal failure policy to the worker — a fetch failure before any batch starts leaves the run untouched', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

    await expect(service.executeRun('run-id')).rejects.toThrow('offline');
    expect(prisma.catalogImportRun.update).not.toHaveBeenCalled();
  });

  it('a permanently-invalid record the adapter skipped is recorded (skippedCount) and does not block the valid ones', async () => {
    const prisma = makePrismaMock();
    const adapter: CatalogSourceAdapter = {
      fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct], skippedCount: 2 }),
    };
    const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

    const result = await service.executeRun('run-id');

    expect(result).toEqual(expect.objectContaining({ skippedCount: 2, createdCount: 1 }));
    expect(prisma.tx.product.create).toHaveBeenCalledTimes(1);
  });

  describe('import scope', () => {
    const otherCategoryProduct = { ...supplierProduct, externalId: '9', name: 'Desk Lamp', categoryName: 'Home Office' };
    const lowImageProduct = { ...supplierProduct, externalId: '11', name: 'Cable Tie Pack', imageCount: 0 };

    it('executeRun only processes products in categoryScope, matched case-insensitively by slug', async () => {
      const prisma = makePrismaMock({ categoryScope: ['computer ACCESSORIES'] }); // mismatched case/spacing on purpose
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct, otherCategoryProduct], skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

      const result = await service.executeRun('run-id');

      expect(prisma.tx.product.create).toHaveBeenCalledTimes(1); // only the in-scope one
      expect(result).toEqual(expect.objectContaining({ discoveredCount: 2, scopedCount: 1, createdCount: 1 }));
    });

    it('executeRun respects maxRecords as a hard cap on the scoped set', async () => {
      const prisma = makePrismaMock({ maxRecords: 1 });
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct, otherCategoryProduct], skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

      await service.executeRun('run-id');

      expect(prisma.tx.product.create).toHaveBeenCalledTimes(1);
    });

    it('executeRun excludes products below minImageCount', async () => {
      const prisma = makePrismaMock({ minImageCount: 1 });
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct, lowImageProduct], skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

      await service.executeRun('run-id');

      expect(prisma.tx.productSource.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ externalId: '7' }) }),
      );
      expect(prisma.tx.product.create).toHaveBeenCalledTimes(1); // lowImageProduct (externalId 11) excluded
    });

    it('preview reports counts without writing anything', async () => {
      const prisma = makePrismaMock();
      prisma.productSource.findUnique.mockResolvedValue(null); // every product would be a fresh create
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct, otherCategoryProduct], skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

      const preview = await service.preview({});

      expect(preview).toEqual(
        expect.objectContaining({
          discoveredCount: 2,
          scopedCount: 2,
          wouldCreateCount: 2,
          wouldUpdateCount: 0,
          wouldBeUnchangedCount: 0,
        }),
      );
      expect(preview.sample).toHaveLength(2);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.tx.product.create).not.toHaveBeenCalled();
      expect(prisma.catalogImportRun.create).not.toHaveBeenCalled();
    });

    it('preview distinguishes create/update/unchanged using the same checksum logic as a real run', async () => {
      const prisma = makePrismaMock();
      const changedChecksum = 'a-checksum-that-will-never-match';
      prisma.productSource.findUnique.mockImplementation(({ where }: { where: { source_externalId: { externalId: string } } }) => {
        if (where.source_externalId.externalId === '7') return Promise.resolve({ checksum: changedChecksum });
        return Promise.resolve(null);
      });
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products: [supplierProduct, otherCategoryProduct], skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock());

      const preview = await service.preview({});

      expect(preview.wouldCreateCount).toBe(1); // otherCategoryProduct
      expect(preview.wouldUpdateCount).toBe(1); // supplierProduct — exists with a different checksum
      expect(preview.sample.find((i) => i.externalId === '7')?.action).toBe('update');
    });
  });

  describe('bounded batches, checkpointing, and interruption/recovery', () => {
    function makeProducts(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        ...supplierProduct,
        externalId: String(i + 1),
        name: `Product ${i + 1}`,
      }));
    }

    it('processes a run across multiple short batches, checkpointing progress after each one', async () => {
      const prisma = makePrismaMock();
      const products = makeProducts(5);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(2)); // batch size 2 -> 3 batches (2,2,1)

      const result = await service.executeRun('run-id');

      // $transaction called once per batch, not once for the whole run.
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(prisma.tx.product.create).toHaveBeenCalledTimes(5);
      expect(result).toEqual(
        expect.objectContaining({
          status: CatalogImportStatus.SUCCEEDED,
          processedCount: 5,
          createdCount: 5,
          scopedCount: 5,
        }),
      );
    });

    it('failure between batches leaves the completed batch committed and does not advance past it', async () => {
      const prisma = makePrismaMock();
      const products = makeProducts(4);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(2)); // 2 batches of 2

      // Batch 1's advisory-lock acquisition succeeds; batch 2's fails outright
      // (simulating e.g. a dropped connection) — before any product-level
      // work in that batch even starts, so there's no partial-batch state
      // to reason about.
      prisma.tx.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }]) // batch 1
        .mockRejectedValueOnce(new Error('connection lost')); // batch 2

      await expect(service.executeRun('run-id')).rejects.toThrow('connection lost');

      const afterFailure = prisma.runStore.snapshot();
      expect(afterFailure.processedCount).toBe(2); // only batch 1 committed
      expect(afterFailure.createdCount).toBe(2);
      expect(afterFailure.status).not.toBe(CatalogImportStatus.SUCCEEDED);
      expect(prisma.tx.product.create).toHaveBeenCalledTimes(2); // batch 2 never started
    });

    it('worker restart after a completed batch: retrying the same run resumes from the checkpoint, not from scratch', async () => {
      const prisma = makePrismaMock();
      const products = makeProducts(4);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(2));

      prisma.tx.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }])
        .mockRejectedValueOnce(new Error('worker crashed'));
      await expect(service.executeRun('run-id')).rejects.toThrow('worker crashed');
      expect(prisma.runStore.snapshot().processedCount).toBe(2);

      // A "restart" is just calling executeRun again against the same run
      // row — nothing in-memory carried over, exactly like a different
      // worker process picking the job back up after a lease-expiry
      // reclaim would look from the service's point of view.
      prisma.tx.$queryRaw.mockResolvedValue([{ acquired: true }]); // healthy from here on
      const result = await service.executeRun('run-id');

      expect(result).toEqual(
        expect.objectContaining({ status: CatalogImportStatus.SUCCEEDED, processedCount: 4, createdCount: 4 }),
      );
      // 2 from the completed first batch + 2 from the successful resume of
      // batch 2 = 4 calls, matching the 4 real products — batch 2's failed
      // attempt died at lock acquisition, before any product-level work,
      // so it left nothing to duplicate on resume.
      expect(prisma.tx.product.create).toHaveBeenCalledTimes(4);
      expect(new Set(prisma.tx.product.create.mock.calls.map((c) => c[0].data.slug)).size).toBe(4);
    });

    it('retrying an already-fully-processed run is a no-op — no duplicate products, offers, or inventory adjustments', async () => {
      const prisma = makePrismaMock();
      const products = makeProducts(3);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(2));

      await service.executeRun('run-id');
      expect(prisma.runStore.snapshot().processedCount).toBe(3);
      const createCallsAfterFirstRun = prisma.tx.product.create.mock.calls.length;

      // Simulates a duplicate worker invocation (e.g. a lease reclaimed by
      // a second worker that turns out not to have actually been dead) —
      // processedCount already covers every scoped product, so `remaining`
      // is empty and no batch even runs.
      const result = await service.executeRun('run-id');

      expect(prisma.tx.product.create).toHaveBeenCalledTimes(createCallsAfterFirstRun); // unchanged
      expect(prisma.tx.inventoryAdjustment.create).toHaveBeenCalledTimes(createCallsAfterFirstRun);
      expect(result).toEqual(expect.objectContaining({ status: CatalogImportStatus.SUCCEEDED, processedCount: 3 }));
    });

    it('progress counters stay accurate through an interruption and a resume — no double-counting', async () => {
      const prisma = makePrismaMock();
      const products = makeProducts(6);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(3)); // 2 batches of 3

      prisma.tx.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }])
        .mockRejectedValueOnce(new Error('transient'));
      await expect(service.executeRun('run-id')).rejects.toThrow();
      expect(prisma.runStore.snapshot()).toEqual(
        expect.objectContaining({ processedCount: 3, createdCount: 3, discoveredCount: 6, scopedCount: 6 }),
      );

      prisma.tx.$queryRaw.mockResolvedValue([{ acquired: true }]);
      const final = await service.executeRun('run-id');
      expect(final).toEqual(
        expect.objectContaining({ processedCount: 6, createdCount: 6, discoveredCount: 6, scopedCount: 6 }),
      );
    });

    it('renews the worker lease (lockedAt) after every batch, not just once at claim time', async () => {
      const prisma = makePrismaMock({ lockedAt: new Date('2020-01-01') });
      const products = makeProducts(4);
      const adapter: CatalogSourceAdapter = {
        fetchProducts: jest.fn().mockResolvedValue({ products, skippedCount: 0 }),
      };
      const service = new CatalogImportService(prisma as never, adapter, makeConfigMock(2));

      await service.executeRun('run-id');

      const lockedAtUpdates = prisma.tx.catalogImportRun.update.mock.calls
        .map((c) => c[0].data.lockedAt)
        .filter((v) => v instanceof Date);
      expect(lockedAtUpdates.length).toBe(2); // one per batch
    });
  });
});
