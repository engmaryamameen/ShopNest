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

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_SOURCE_ADAPTER) private readonly adapter: CatalogSourceAdapter,
  ) {}

  async enqueueDummyJson() {
    const source = CatalogSource.DUMMY_JSON;
    try {
      return await this.prisma.catalogImportRun.create({
        data: { source, status: CatalogImportStatus.QUEUED },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A catalog synchronization is already queued or running');
      }
      throw error;
    }
  }

  async executeRun(runId: string) {
    const source = CatalogSource.DUMMY_JSON;
    const products = await this.adapter.fetchProducts();
    const counts = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`shopnest:catalog-import:${source}`})) AS acquired
        `;
        if (!lock?.acquired) throw new ConflictException('A catalog import is already running');

        const systemVendorId = await this.ensureSystemVendor(tx);

        const result: ImportCounts = {
          discoveredCount: products.length,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
        };

        for (const product of products) await this.upsertProduct(tx, source, product, systemVendorId, result);
        return result;
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
