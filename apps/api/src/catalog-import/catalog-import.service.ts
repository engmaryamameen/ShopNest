import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { CatalogImportStatus, CatalogSource, OfferStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_VENDOR_NAME, SYSTEM_VENDOR_SLUG } from '../catalog/system-vendor.constants';
import {
  CATALOG_SOURCE_ADAPTER,
  CatalogSourceAdapter,
  SupplierProduct,
} from './catalog-source.adapter';

type ImportCounts = {
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
};

export interface ImportScope {
  /** Category names to include (case-insensitive, compared by slug — same
   * normalization already used for canonical category matching). Empty or
   * omitted means no restriction, never "match nothing". */
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
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldBeUnchangedCount: number;
  /** First N scoped items, for a human to sanity-check the scope before
   * committing to a real run — not the full scoped set (see `scopedCount`
   * for the true total; this is a bounded sample, not a silent truncation
   * of what the real run would process). */
  sample: ImportPreviewItem[];
}

const PREVIEW_SAMPLE_SIZE = 25;

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_SOURCE_ADAPTER) private readonly adapter: CatalogSourceAdapter,
  ) {}

  async enqueueDummyJson(scope: ImportScope = {}) {
    const source = CatalogSource.DUMMY_JSON;
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
   * while tuning scope filters before committing to `enqueueDummyJson`. */
  async preview(scope: ImportScope = {}): Promise<ImportPreview> {
    const source = CatalogSource.DUMMY_JSON;
    const discovered = await this.adapter.fetchProducts();
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
      wouldCreateCount,
      wouldUpdateCount,
      wouldBeUnchangedCount,
      sample: items,
    };
  }

  async executeRun(runId: string) {
    const source = CatalogSource.DUMMY_JSON;
    const run = await this.prisma.catalogImportRun.findUniqueOrThrow({ where: { id: runId } });
    const discovered = await this.adapter.fetchProducts();
    const products = this.applyScope(discovered, {
      categoryScope: run.categoryScope,
      maxRecords: run.maxRecords ?? undefined,
      minImageCount: run.minImageCount ?? undefined,
    });

    const counts = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`shopnest:catalog-import:${source}`})) AS acquired
        `;
        if (!lock?.acquired) throw new ConflictException('A catalog import is already running');

        const systemVendorId = await this.ensureSystemVendor(tx);

        const result: ImportCounts = {
          discoveredCount: discovered.length,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
        };

        for (const product of products) await this.upsertProduct(tx, source, product, systemVendorId, result);
        return result;
    }, {
      // Every product's upsert (canonical row + media + offer + inventory
      // adjustment) runs sequentially inside this one transaction, so the
      // advisory lock and all-or-nothing atomicity cover the entire run —
      // deliberate, so a mid-run failure never leaves a partially-imported
      // catalog. That means the timeout has to scale with catalog size:
      // Prisma's 5s interactive-transaction default is comfortably enough
      // for a handful of scoped products but was measured to run out
      // partway through DummyJSON's full ~194-product catalog in this
      // environment, aborting the whole run. 60s covers a full unscoped
      // DummyJSON sync with headroom; a supplier catalog large enough to
      // need more than that would need this run chunked into batches
      // instead of one longer timeout — not a problem at this project's
      // scale, flagged here rather than silently papered over.
      timeout: 60_000,
      maxWait: 10_000,
    });

    return this.prisma.catalogImportRun.update({
      where: { id: runId },
      data: {
        ...counts,
        status: CatalogImportStatus.SUCCEEDED,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        errorMessage: null,
      },
    });
  }

  /** Applied identically by `preview()` and `executeRun()` — the whole
   * point of a preview is that it shows exactly what the real run will do,
   * so the filter logic must not diverge between the two call sites. */
  private applyScope(products: SupplierProduct[], scope: ImportScope): SupplierProduct[] {
    let result = products;

    if (scope.categoryScope && scope.categoryScope.length > 0) {
      const allowed = new Set(scope.categoryScope.map((c) => this.slugify(c)));
      result = result.filter((p) => allowed.has(this.slugify(p.categoryName)));
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

  /** Writes only canonical fields (name/description/category/media) to
   * `Product` — price and stock go to the system vendor's `VendorOffer`
   * instead, never to `Product.priceCents`/`stockQuantity` directly. This
   * is the mechanical half of "imports never overwrite vendor-owned
   * commercial data": once the destructive migration drops those columns,
   * there will be nothing on Product for an import to overwrite even by
   * mistake — for now (columns not yet dropped), this method simply never
   * writes to them, deliberately, unlike CatalogService's admin-facing
   * create/update which still echoes them (see that file's doc comment).
   */
  private async upsertProduct(
    tx: Prisma.TransactionClient,
    source: CatalogSource,
    incoming: SupplierProduct,
    systemVendorId: string,
    counts: ImportCounts,
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

    const canonicalData = {
      name: incoming.name,
      description: incoming.description,
      categoryId: category.id,
      publishStatus: 'PUBLISHED' as const,
    };

    const productId = existing
      ? existing.productId
      : (
          await tx.product.create({
            data: {
              ...canonicalData,
              slug: `${this.slugify(incoming.name)}-${source.toLowerCase()}-${incoming.externalId}`,
            },
          })
        ).id;

    if (existing) {
      await tx.product.update({ where: { id: productId }, data: canonicalData });
      await tx.productSource.update({ where: { id: existing.id }, data: { checksum, lastSeenAt: now } });
      counts.updatedCount++;
    } else {
      await tx.productSource.create({
        data: { productId, source, externalId: incoming.externalId, checksum, lastSeenAt: now },
      });
      counts.createdCount++;
    }

    if (incoming.imageUrl) {
      await tx.productMedia.upsert({
        where: { productId_position: { productId, position: 0 } },
        create: { productId, url: incoming.imageUrl, position: 0 },
        update: { url: incoming.imageUrl },
      });
    }

    await this.syncOffer(tx, systemVendorId, productId, source, incoming);
  }

  private async syncOffer(
    tx: Prisma.TransactionClient,
    systemVendorId: string,
    productId: string,
    source: CatalogSource,
    incoming: SupplierProduct,
  ): Promise<void> {
    const vendorSku = `${source.toLowerCase()}-${incoming.externalId}`;
    const existingOffer = await tx.vendorOffer.findFirst({
      where: { vendorId: systemVendorId, productId, variantId: null },
    });

    if (!existingOffer) {
      const offer = await tx.vendorOffer.create({
        data: {
          vendorId: systemVendorId,
          productId,
          vendorSku,
          priceCents: incoming.priceCents,
          stockQuantity: incoming.stockQuantity,
          status: OfferStatus.ACTIVE,
        },
      });
      if (incoming.stockQuantity !== 0) {
        await tx.inventoryAdjustment.create({
          data: {
            vendorOfferId: offer.id,
            delta: incoming.stockQuantity,
            reason: 'IMPORT_INITIAL',
            reference: `import:${source}:${incoming.externalId}`,
          },
        });
      }
      return;
    }

    const delta = incoming.stockQuantity - existingOffer.stockQuantity;
    await tx.vendorOffer.update({
      where: { id: existingOffer.id },
      data: { priceCents: incoming.priceCents, stockQuantity: incoming.stockQuantity },
    });
    if (delta !== 0) {
      await tx.inventoryAdjustment.create({
        data: {
          vendorOfferId: existingOffer.id,
          delta,
          reason: 'CORRECTION',
          reference: `import:${source}:${incoming.externalId}`,
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
