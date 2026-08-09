import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { CatalogImportStatus, CatalogSource, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
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

        const result: ImportCounts = {
          discoveredCount: products.length,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
        };

        for (const product of products) await this.upsertProduct(tx, source, product, result);
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

  private async upsertProduct(
    tx: Prisma.TransactionClient,
    source: CatalogSource,
    incoming: SupplierProduct,
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
    const productData = {
      name: incoming.name,
      description: incoming.description,
      priceCents: incoming.priceCents,
      stockQuantity: incoming.stockQuantity,
      imageUrl: incoming.imageUrl,
      categoryId: category.id,
      isActive: true,
    };

    if (existing) {
      await tx.product.update({ where: { id: existing.productId }, data: productData });
      await tx.productSource.update({
        where: { id: existing.id },
        data: { checksum, lastSeenAt: now },
      });
      counts.updatedCount++;
      return;
    }

    const product = await tx.product.create({
      data: {
        ...productData,
        slug: `${this.slugify(incoming.name)}-${source.toLowerCase()}-${incoming.externalId}`,
      },
    });
    await tx.productSource.create({
      data: {
        productId: product.id,
        source,
        externalId: incoming.externalId,
        checksum,
        lastSeenAt: now,
      },
    });
    counts.createdCount++;
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
