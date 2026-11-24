import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

const MARKER_ID = '0a310000-0000-4000-8000-000000000001';
const MARKER_SLUG = 'shopnest-demo-paper-goods';
const MARKER_DESCRIPTION = 'ShopNest fictional demo catalog fixture v1';

@Injectable()
export class DemoCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async apply() {
    // A production-like demo requires its own explicit, reviewed deployment design.
    if (process.env.NODE_ENV !== 'development' || process.env.DEMO_CATALOG_ENABLED !== 'true') {
      throw new NotFoundException('Demo catalog is not available');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize competing requests without relying on a browser lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1397247572, 1)`;
        const marker = await tx.vendor.findUnique({ where: { id: MARKER_ID } });
        if (marker) {
          if (marker.slug !== MARKER_SLUG || marker.description !== MARKER_DESCRIPTION) {
            throw new ConflictException('The demo catalog identifier is already in use. No data was changed.');
          }
          return { result: 'already_applied' as const };
        }

        const vendorA = await tx.vendor.create({ data: { id: MARKER_ID, slug: MARKER_SLUG, name: 'Demo Paper Goods', description: MARKER_DESCRIPTION, status: 'APPROVED', contactEmail: 'paper@example.test' } });
        const vendorB = await tx.vendor.create({ data: { id: '0a310000-0000-4000-8000-000000000002', slug: 'shopnest-demo-workshop', name: 'Demo Workshop', description: 'Fictional seller for the ShopNest demo.', status: 'APPROVED', contactEmail: 'workshop@example.test' } });
        const category = await tx.category.create({ data: { id: '0a310000-0000-4000-8000-000000000003', name: 'Demo Desk Accessories', slug: 'shopnest-demo-desk-accessories' } });
        const fixtures = [
          { productId: '0a310000-0000-4000-8000-000000000004', offerId: '0a310000-0000-4000-8000-000000000005', vendorId: vendorA.id, name: 'Demo Grid Notebook', slug: 'shopnest-demo-grid-notebook', priceCents: 1200, stockQuantity: 12 },
          { productId: '0a310000-0000-4000-8000-000000000006', offerId: '0a310000-0000-4000-8000-000000000007', vendorId: vendorB.id, name: 'Demo Desk Tray', slug: 'shopnest-demo-desk-tray', priceCents: 2400, stockQuantity: 8 },
        ];
        for (const item of fixtures) {
          const product = await tx.product.create({ data: { id: item.productId, name: item.name, slug: item.slug, description: 'Fictional item for a simulated marketplace.', categoryId: category.id, publishStatus: 'PUBLISHED' } });
          const offer = await tx.vendorOffer.create({ data: { id: item.offerId, vendorId: item.vendorId, productId: product.id, vendorSku: item.slug, priceCents: item.priceCents, stockQuantity: item.stockQuantity, status: 'ACTIVE' } });
          await tx.inventoryAdjustment.create({ data: { vendorOfferId: offer.id, delta: item.stockQuantity, reason: 'IMPORT_INITIAL', reference: 'demo-catalog:v1' } });
        }
        return { result: 'created' as const };
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A demo catalog name is already in use. No data was changed.');
      }
      throw error;
    }
  }
}
