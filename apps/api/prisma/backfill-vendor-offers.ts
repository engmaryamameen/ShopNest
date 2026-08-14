/**
 * Phase 2 backfill — re-points every pre-existing row at the new
 * Vendor/VendorOffer model without touching anything the additive
 * migration (0006_phase2_catalog_vendor_remodel) didn't already add as a
 * nullable column. Safe to re-run: every step checks what's already done
 * before writing, so a partial run (crash, redeploy mid-backfill) resumes
 * correctly instead of double-writing.
 *
 * Run: pnpm --filter @shopnest/api migrate:backfill-vendor-offers
 *
 * Order matters — each step depends on the previous one's output:
 *   1. system vendor exists
 *   2. every Product has exactly one VendorOffer under that vendor
 *   3. every Product's single `imageUrl` becomes its first ProductMedia row
 *      (new code reads ProductMedia exclusively — see Product's model doc)
 *   4. every CartItem's vendorOfferId is set from its productId
 *   5. every Order has one VendorOrder (there was only ever one vendor
 *      possible before this migration, so this is always a 1:1 today)
 *   6. every OrderItem is re-pointed at that VendorOrder/VendorOffer, with
 *      a vendorName snapshot
 *   7. every OrderStatusHistory row is re-pointed at that VendorOrder
 */
import { PrismaClient, InventoryAdjustmentReason, OfferStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_VENDOR_SLUG = 'shopnest-direct';
const SYSTEM_VENDOR_NAME = 'ShopNest Direct';

async function ensureSystemVendor() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: SYSTEM_VENDOR_SLUG },
    update: {},
    create: {
      name: SYSTEM_VENDOR_NAME,
      slug: SYSTEM_VENDOR_SLUG,
      status: 'APPROVED',
      contactEmail: process.env.ADMIN_EMAIL ?? 'admin@shopnest.dev',
      description: 'The platform-operated storefront — imported catalog and first-party listings.',
      approvedAt: new Date(),
    },
  });
  console.log(`System vendor ready: ${vendor.name} (${vendor.id})`);
  return vendor;
}

async function backfillVendorOffers(systemVendorId: string) {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, priceCents: true, stockQuantity: true, isActive: true },
  });

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.vendorOffer.findFirst({
      where: { vendorId: systemVendorId, productId: product.id, variantId: null },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const offer = await tx.vendorOffer.create({
        data: {
          vendorId: systemVendorId,
          productId: product.id,
          variantId: null,
          vendorSku: product.slug,
          condition: 'NEW',
          priceCents: product.priceCents,
          stockQuantity: product.stockQuantity,
          status: product.isActive ? OfferStatus.ACTIVE : OfferStatus.INACTIVE,
        },
      });

      // Every stock mutation gets a matching InventoryAdjustment row, no
      // exceptions — including this one-time initialization.
      if (product.stockQuantity !== 0) {
        await tx.inventoryAdjustment.create({
          data: {
            vendorOfferId: offer.id,
            delta: product.stockQuantity,
            reason: InventoryAdjustmentReason.IMPORT_INITIAL,
            reference: `backfill:${product.id}`,
          },
        });
      }
    });

    created++;
  }

  console.log(`VendorOffers backfilled: ${created} created, ${skipped} already existed`);
}

async function backfillProductMedia() {
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true },
  });

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.productMedia.findUnique({
      where: { productId_position: { productId: product.id, position: 0 } },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.productMedia.create({
      data: { productId: product.id, url: product.imageUrl!, position: 0 },
    });
    created++;
  }

  console.log(`ProductMedia backfilled: ${created} created, ${skipped} already existed`);
}

async function backfillCartItems(systemVendorId: string) {
  const pending = await prisma.cartItem.findMany({
    where: { productId: { not: null }, vendorOfferId: null },
    select: { id: true, productId: true },
  });

  let updated = 0;

  for (const item of pending) {
    const offer = await prisma.vendorOffer.findFirst({
      where: { vendorId: systemVendorId, productId: item.productId!, variantId: null },
      select: { id: true },
    });

    if (!offer) continue; // shouldn't happen after backfillVendorOffers, but never crash the loop over one bad row

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { vendorOfferId: offer.id },
    });
    updated++;
  }

  console.log(`CartItems re-pointed at vendorOfferId: ${updated}`);
}

async function backfillOrders(systemVendorId: string) {
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      status: true,
      totalCents: true,
      items: { select: { id: true, productId: true } },
    },
  });

  let ordersProcessed = 0;
  let itemsUpdated = 0;
  let historyUpdated = 0;

  for (const order of orders) {
    const vendorOrder = await prisma.vendorOrder.upsert({
      where: { orderId_vendorId: { orderId: order.id, vendorId: systemVendorId } },
      update: {},
      create: {
        orderId: order.id,
        vendorId: systemVendorId,
        status: order.status,
        subtotalCents: order.totalCents, // every pre-Phase-2 order only ever had one possible vendor
      },
    });

    for (const item of order.items) {
      if (!item.productId) continue; // already backfilled

      const offer = await prisma.vendorOffer.findFirst({
        where: { vendorId: systemVendorId, productId: item.productId, variantId: null },
        select: { id: true },
      });

      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          vendorOfferId: offer?.id ?? null,
          vendorOrderId: vendorOrder.id,
          vendorName: SYSTEM_VENDOR_NAME,
        },
      });
      itemsUpdated++;
    }

    const historyResult = await prisma.orderStatusHistory.updateMany({
      where: { orderId: order.id, vendorOrderId: null },
      data: { vendorOrderId: vendorOrder.id },
    });
    historyUpdated += historyResult.count;

    ordersProcessed++;
  }

  console.log(
    `Orders processed: ${ordersProcessed} (VendorOrders upserted), ${itemsUpdated} OrderItems re-pointed, ${historyUpdated} OrderStatusHistory rows re-pointed`,
  );
}

async function main() {
  const systemVendor = await ensureSystemVendor();
  await backfillVendorOffers(systemVendor.id);
  await backfillProductMedia();
  await backfillCartItems(systemVendor.id);
  await backfillOrders(systemVendor.id);
  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
