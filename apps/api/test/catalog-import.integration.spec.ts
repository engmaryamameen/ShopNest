/**
 * Catalog-import worker/service integration tests — against a real
 * PostgreSQL database, not mocks. Covers the specific failure/recovery
 * scenarios that only mean something against a real row and real SQL:
 * lease-expiry reclaim by a second worker, and batch checkpointing
 * surviving an actual transaction rollback (not a mocked one).
 *
 * Run: cd apps/api && pnpm test:e2e
 */

import { CatalogImportStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CatalogImportWorker } from '../src/catalog-import/catalog-import.worker';
import { CatalogImportService } from '../src/catalog-import/catalog-import.service';
import type { CatalogSourceAdapter, FetchProductsResult } from '../src/catalog-import/catalog-source.adapter';
import type { CatalogSourceRegistry } from '../src/catalog-import/catalog-source-registry';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

function makeConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'app.catalogWorkerLeaseSeconds': 300,
    'app.catalogImportBatchSize': 2,
    ...overrides,
  };
  return { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) } as never;
}

function makeStubAdapter(products: FetchProductsResult['products']): CatalogSourceAdapter {
  return { fetchProducts: async () => ({ products, skippedCount: 0 }) };
}

function makeRegistry(adapter: CatalogSourceAdapter): CatalogSourceRegistry {
  return { resolve: () => adapter } as unknown as CatalogSourceRegistry;
}

const createdRunIds: string[] = [];

async function createRun(overrides: Partial<{
  status: CatalogImportStatus;
  lockedAt: Date | null;
  lockedBy: string | null;
  attemptCount: number;
}> = {}) {
  const run = await prisma.catalogImportRun.create({
    data: {
      source: 'DUMMY_JSON',
      status: overrides.status ?? CatalogImportStatus.QUEUED,
      lockedAt: overrides.lockedAt ?? null,
      lockedBy: overrides.lockedBy ?? null,
      attemptCount: overrides.attemptCount ?? 0,
    },
  });
  createdRunIds.push(run.id);
  return run;
}

describe('Catalog import — real-database worker and checkpoint behavior', () => {
  afterEach(async () => {
    // This runs against the real shared dev database (not an ephemeral
    // per-test one), so cleanup must be scoped to exactly what this suite
    // created — a global deleteMany() on VendorOffer/CatalogImportRun
    // would destroy unrelated data (and did, the first time this was
    // written: it hit a real FK violation against a real CartItem
    // elsewhere in the database). Every row this suite creates is
    // reachable by the 'catimp-' marker in a product/category slug, so
    // scope every deletion through that.
    const catimpProducts = await prisma.product.findMany({
      where: { slug: { contains: 'catimp-' } },
      select: { id: true },
    });
    const productIds = catimpProducts.map((p) => p.id);

    const catimpOffers = await prisma.vendorOffer.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    const offerIds = catimpOffers.map((o) => o.id);

    await prisma.inventoryAdjustment.deleteMany({ where: { vendorOfferId: { in: offerIds } } });
    await prisma.vendorOffer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.productMedia.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productSource.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { slug: { contains: 'catimp-' } } });
    await prisma.catalogImportRun.deleteMany({ where: { id: { in: createdRunIds } } });
    createdRunIds.length = 0;
  });

  it('a second worker reclaims a run whose lease has expired (the first worker never came back)', async () => {
    const staleRun = await createRun({
      status: CatalogImportStatus.RUNNING,
      lockedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      lockedBy: 'dead-worker',
      attemptCount: 1,
    });

    const imports = { executeRun: jest.fn().mockResolvedValue(undefined) };
    // 1-second lease — the 10-minutes-ago lock is unambiguously stale.
    const secondWorker = new CatalogImportWorker(prisma as never, imports as never, makeConfig({ 'app.catalogWorkerLeaseSeconds': 1 }));

    await secondWorker.poll();

    expect(imports.executeRun).toHaveBeenCalledWith(staleRun.id);
    const reclaimed = await prisma.catalogImportRun.findUniqueOrThrow({ where: { id: staleRun.id } });
    expect(reclaimed.lockedBy).not.toBe('dead-worker');
    expect(reclaimed.attemptCount).toBe(2);
  });

  it('does NOT reclaim a run whose lease is still comfortably live', async () => {
    await createRun({
      status: CatalogImportStatus.RUNNING,
      lockedAt: new Date(), // just now
      lockedBy: 'busy-worker',
      attemptCount: 1,
    });

    const imports = { executeRun: jest.fn().mockResolvedValue(undefined) };
    const worker = new CatalogImportWorker(prisma as never, imports as never, makeConfig({ 'app.catalogWorkerLeaseSeconds': 300 }));

    await worker.poll();

    expect(imports.executeRun).not.toHaveBeenCalled();
  });

  it('checkpoints real batch progress across an actual transaction rollback, then resumes cleanly', async () => {
    const run = await createRun();
    const products = Array.from({ length: 4 }, (_, i) => ({
      externalId: `catimp-integration-${randomUUID()}-${i}`,
      name: `Catimp Integration Product ${i}`,
      description: 'A real product used by the catalog-import integration test.',
      categoryName: 'Catimp Integration Category',
      priceCents: 1000 + i,
      stockQuantity: 5,
      imageCount: 0,
    }));

    const service = new CatalogImportService(
      prisma as never,
      makeRegistry(makeStubAdapter(products)),
      makeConfig({ 'app.catalogImportBatchSize': 2 }),
    );

    // Force the second batch (products 2 and 3) to fail with a *real*
    // Postgres error rather than a mocked one: pre-insert a product whose
    // slug collides with product 3's — its upsert hits a genuine unique-
    // constraint violation, aborting that batch's transaction for real.
    const collidingSlug = `${products[3].name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dummy_json-${products[3].externalId}`;
    const category = await prisma.category.create({
      data: { name: `Catimp Integration Category Collide ${randomUUID()}`, slug: `catimp-collide-${randomUUID()}` },
    });
    await prisma.product.create({
      data: { name: 'Colliding product', slug: collidingSlug, description: 'Pre-existing.', categoryId: category.id },
    });

    await expect(service.executeRun(run.id)).rejects.toThrow();

    const afterFailure = await prisma.catalogImportRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(afterFailure.processedCount).toBe(2); // batch 1 (products 0,1) committed for real
    expect(afterFailure.createdCount).toBe(2);
    expect(afterFailure.status).not.toBe(CatalogImportStatus.SUCCEEDED);

    const productsAfterFailure = await prisma.product.findMany({
      where: { slug: { in: products.slice(0, 2).map((p) => `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dummy_json-${p.externalId}`) } },
    });
    expect(productsAfterFailure).toHaveLength(2); // really committed, not rolled back with the rest

    // Resolve the collision (rename the pre-existing product out of the
    // way) and resume — the run must complete from the checkpoint, not
    // from scratch.
    await prisma.product.updateMany({
      where: { slug: collidingSlug },
      data: { slug: `${collidingSlug}-renamed-out-of-the-way` },
    });

    const final = await service.executeRun(run.id);
    expect(final.status).toBe(CatalogImportStatus.SUCCEEDED);
    expect(final.processedCount).toBe(4);
    expect(final.createdCount).toBe(4);

    const allCreated = await prisma.product.findMany({
      where: { slug: { in: products.map((p) => `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dummy_json-${p.externalId}`) } },
    });
    expect(allCreated).toHaveLength(4); // no duplicates from the retried batch
  });
});
