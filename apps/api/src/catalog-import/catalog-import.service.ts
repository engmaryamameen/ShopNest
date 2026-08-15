import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogImportStatus, CatalogSource, OfferStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_VENDOR_NAME, SYSTEM_VENDOR_SLUG } from '../catalog/system-vendor.constants';
import { SupplierProduct } from './catalog-source.adapter';
import { CatalogSourceRegistry } from './catalog-source-registry';

type BatchCounts = {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
};

export interface ImportScope {
  /** Category names, matched case-insensitively by slug. Empty/omitted =
   * no restriction. */
  categoryScope?: string[];
  maxRecords?: number;
  minImageCount?: number;
}

export interface ImportPreviewItem {
  externalId: string;
  name: string;
  categoryName: string;
  action: 'create' | 'update' | 'unchanged';
}

export interface ImportPreview {
  discoveredCount: number;
  scopedCount: number;
  skippedCount: number;
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldBeUnchangedCount: number;
  /** First N scoped items, for sanity-checking — not the full set
   * (see scopedCount for the true total). */
  sample: ImportPreviewItem[];
}

const PREVIEW_SAMPLE_SIZE = 25;

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CatalogSourceRegistry,
    private readonly config: ConfigService,
  ) {}

  async enqueue(source: CatalogSource, scope: ImportScope = {}) {
    try {
      return await this.prisma.catalogImportRun.create({
        data: {
          source,
          status: CatalogImportStatus.QUEUED,
          categoryScope: scope.categoryScope ?? [],
          maxRecords: scope.maxRecords ?? null,
          minImageCount: scope.minImageCount ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A catalog synchronization is already queued or running');
      }
      throw error;
    }
  }

  /** Dry run: fetches from the real supplier and computes what a real run
   * would do, without writing anything — no transaction, no advisory lock,
   * because nothing is mutated. Safe to call as often as an admin wants
   * while tuning scope filters before committing to `enqueue`. */
  async preview(source: CatalogSource, scope: ImportScope = {}): Promise<ImportPreview> {
    const { products: discovered, skippedCount } = await this.registry.resolve(source).fetchProducts();
    const scoped = this.applyScope(discovered, scope);

    const items: ImportPreviewItem[] = [];
    let wouldCreateCount = 0;
    let wouldUpdateCount = 0;
    let wouldBeUnchangedCount = 0;

    for (const product of scoped) {
      const existing = await this.prisma.productSource.findUnique({
        where: { source_externalId: { source, externalId: product.externalId } },
      });
      const action: ImportPreviewItem['action'] = !existing
        ? 'create'
        : existing.checksum === this.checksum(product)
          ? 'unchanged'
          : 'update';

      if (action === 'create') wouldCreateCount++;
      else if (action === 'update') wouldUpdateCount++;
      else wouldBeUnchangedCount++;

      if (items.length < PREVIEW_SAMPLE_SIZE) {
        items.push({ externalId: product.externalId, name: product.name, categoryName: product.categoryName, action });
      }
    }

    return {
      discoveredCount: discovered.length,
      scopedCount: scoped.length,
      skippedCount,
      wouldCreateCount,
      wouldUpdateCount,
      wouldBeUnchangedCount,
      sample: items,
    };
  }

  /** Runs in small, independently-committed batches, not one transaction
   * for the whole catalog — bounds lock/connection time per batch, and
   * makes a crash/reclaim/retry resumable via processedCount. */
  async executeRun(runId: string) {
    const run = await this.prisma.catalogImportRun.findUniqueOrThrow({ where: { id: runId } });
    const source = run.source;
    const { products: discovered, skippedCount } = await this.registry.resolve(source).fetchProducts();
    const scoped = this.applyScope(discovered, {
      categoryScope: run.categoryScope,
      maxRecords: run.maxRecords ?? undefined,
      minImageCount: run.minImageCount ?? undefined,
    });

    // Only the first entry records totals — a resumed run shouldn't
    // overwrite them from a second, possibly-different live fetch.
    if (run.processedCount === 0) {
      await this.prisma.catalogImportRun.update({
        where: { id: runId },
        data: {
          discoveredCount: discovered.length,
          scopedCount: scoped.length,
          skippedCount,
          status: CatalogImportStatus.RUNNING,
        },
      });
    }

    const batchSize = this.config.get<number>('app.catalogImportBatchSize', 25);
    const remaining = scoped.slice(run.processedCount);

    for (let offset = 0; offset < remaining.length; offset += batchSize) {
      await this.processBatch(runId, source, remaining.slice(offset, offset + batchSize));
    }

    return this.prisma.catalogImportRun.update({
      where: { id: runId },
      data: {
        status: CatalogImportStatus.SUCCEEDED,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        errorMessage: null,
      },
    });
  }

  /** One batch, one short transaction — only this batch rolls back on
   * failure; prior batches stand. */
  private async processBatch(runId: string, source: CatalogSource, batch: SupplierProduct[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Defense-in-depth — the real cross-run guard is the partial unique
      // index on CatalogImportRun(source) WHERE status IN (QUEUED, RUNNING).
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${`shopnest:catalog-import:${source}`})) AS acquired
      `;
      if (!lock?.acquired) throw new ConflictException('A catalog import is already running');

      const systemVendorId = await this.ensureSystemVendor(tx);
      const counts: BatchCounts = { createdCount: 0, updatedCount: 0, unchangedCount: 0 };

      for (const product of batch) await this.upsertProduct(tx, source, product, systemVendorId, counts);

      await tx.catalogImportRun.update({
        where: { id: runId },
        data: {
          processedCount: { increment: batch.length },
          createdCount: { increment: counts.createdCount },
          updatedCount: { increment: counts.updatedCount },
          unchangedCount: { increment: counts.unchangedCount },
          lockedAt: new Date(),
        },
      });
    });
    // No timeout override needed — a bounded batch fits Prisma's default.
  }

  /** Applied identically by `preview()` and `executeRun()` — the whole
   * point of a preview is that it shows exactly what the real run will do,
   * so the filter logic must not diverge between the two call sites. */
  private applyScope(products: SupplierProduct[], scope: ImportScope): SupplierProduct[] {
    let result = products;

    if (scope.categoryScope && scope.categoryScope.length > 0) {
      // Substring, not exact-slug equality — a supplier's own category
      // vocabulary rarely matches what an admin types verbatim (Amazon's
      // "Electronics" file lists every record under "All Electronics";
      // DummyJSON has no umbrella "electronics" at all, only
      // "smartphones"/"laptops"/"tablets"). Requiring an exact match made
      // scoping unusable in practice — verified live, an admin scoping to
      // "Electronics" got zero results against real Amazon data that
      // plainly included electronics. A needle that slugifies to nothing
      // (blank input) is dropped, not treated as "matches everything."
      const needles = scope.categoryScope.map((c) => this.slugify(c)).filter((needle) => needle.length > 0);
      if (needles.length > 0) {
        result = result.filter((p) => {
          const haystack = this.slugify(p.categoryName);
          return needles.some((needle) => haystack.includes(needle));
        });
      }
    }

    if (scope.minImageCount !== undefined) {
      result = result.filter((p) => p.imageCount >= scope.minImageCount!);
    }

    if (scope.maxRecords !== undefined) {
      result = result.slice(0, scope.maxRecords);
    }

    return result;
  }

  listRuns(limit = 20) {
    return this.prisma.catalogImportRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /** Idempotent — safe to call on every run rather than relying on the
   * backfill script having created this row first, so a genuinely fresh
   * deployment (import runs before anyone thinks to seed/backfill) still
   * has somewhere to attach imported listings. */
  private async ensureSystemVendor(tx: Prisma.TransactionClient): Promise<string> {
    const vendor = await tx.vendor.upsert({
      where: { slug: SYSTEM_VENDOR_SLUG },
      update: {},
      create: {
        name: SYSTEM_VENDOR_NAME,
        slug: SYSTEM_VENDOR_SLUG,
        status: 'APPROVED',
        contactEmail: 'admin@shopnest.dev',
        description: 'The platform-operated storefront — imported catalog and first-party listings.',
        approvedAt: new Date(),
      },
    });
    return vendor.id;
  }

  /** Writes only canonical fields to Product — price/stock go to the
   * system vendor's VendorOffer. */
  private async upsertProduct(
    tx: Prisma.TransactionClient,
    source: CatalogSource,
    incoming: SupplierProduct,
    systemVendorId: string,
    counts: BatchCounts,
  ): Promise<void> {
    const now = new Date();
    const checksum = this.checksum(incoming);
    const existing = await tx.productSource.findUnique({
      where: { source_externalId: { source, externalId: incoming.externalId } },
    });

    if (existing?.checksum === checksum) {
      await tx.productSource.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
      counts.unchangedCount++;
      return;
    }

    const categorySlug = this.slugify(incoming.categoryName);
    const category = await tx.category.upsert({
      where: { slug: categorySlug },
      create: { name: incoming.categoryName, slug: categorySlug },
      update: {},
    });

    const hasCommercialData = incoming.priceCents !== undefined && incoming.stockQuantity !== undefined;
    const updatableFields = { name: incoming.name, description: incoming.description, categoryId: category.id };

    let productId: string;
    if (existing) {
      productId = existing.productId;
      await tx.product.update({ where: { id: productId }, data: updatableFields });
      await tx.productSource.update({ where: { id: existing.id }, data: { checksum, lastSeenAt: now } });
      counts.updatedCount++;
    } else {
      const created = await tx.product.create({
        data: {
          ...updatableFields,
          // Both the source and externalId are slugified, not
          // interpolated raw — `CatalogSource.DUMMY_JSON.toLowerCase()`
          // is "dummy_json" (an underscore), and Amazon's ASINs (e.g.
          // "B0BLXXGZJL") are uppercase; either one breaks the admin edit
          // form's lowercase-kebab-case slug validation. An invalid slug
          // would import fine but then reject the very first edit of
          // that product.
          slug: `${this.slugify(incoming.name)}-${this.slugify(source)}-${this.slugify(incoming.externalId)}`,
          publishStatus: hasCommercialData ? 'PUBLISHED' : 'DRAFT',
        },
      });
      productId = created.id;
      await tx.productSource.create({
        data: { productId, source, externalId: incoming.externalId, checksum, lastSeenAt: now },
      });
      counts.createdCount++;
    }

    const images = incoming.imageUrls && incoming.imageUrls.length > 0 ? incoming.imageUrls : incoming.imageUrl ? [incoming.imageUrl] : [];
    for (let position = 0; position < images.length; position++) {
      await tx.productMedia.upsert({
        where: { productId_position: { productId, position } },
        create: { productId, url: images[position], position },
        update: { url: images[position] },
      });
    }
    // A re-sync with fewer images than last time must not leave stale
    // rows behind at the old, now-unused positions. A no-op for a
    // brand-new product, which has nothing to clean up yet.
    await tx.productMedia.deleteMany({ where: { productId, position: { gte: images.length } } });

    if (hasCommercialData) {
      await this.syncOffer(
        tx,
        systemVendorId,
        productId,
        source,
        incoming.externalId,
        incoming.priceCents!,
        incoming.stockQuantity!,
      );
    }
  }

  private async syncOffer(
    tx: Prisma.TransactionClient,
    systemVendorId: string,
    productId: string,
    source: CatalogSource,
    externalId: string,
    priceCents: number,
    stockQuantity: number,
  ): Promise<void> {
    const vendorSku = `${source.toLowerCase()}-${externalId}`;
    const existingOffer = await tx.vendorOffer.findFirst({
      where: { vendorId: systemVendorId, productId, variantId: null },
    });

    if (!existingOffer) {
      const offer = await tx.vendorOffer.create({
        data: { vendorId: systemVendorId, productId, vendorSku, priceCents, stockQuantity, status: OfferStatus.ACTIVE },
      });
      if (stockQuantity !== 0) {
        await tx.inventoryAdjustment.create({
          data: {
            vendorOfferId: offer.id,
            delta: stockQuantity,
            reason: 'IMPORT_INITIAL',
            reference: `import:${source}:${externalId}`,
          },
        });
      }
      return;
    }

    const delta = stockQuantity - existingOffer.stockQuantity;
    await tx.vendorOffer.update({ where: { id: existingOffer.id }, data: { priceCents, stockQuantity } });
    if (delta !== 0) {
      await tx.inventoryAdjustment.create({
        data: {
          vendorOfferId: existingOffer.id,
          delta,
          reason: 'CORRECTION',
          reference: `import:${source}:${externalId}`,
        },
      });
    }
  }

  private checksum(product: SupplierProduct): string {
    return createHash('sha256').update(JSON.stringify(product)).digest('hex');
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

}
