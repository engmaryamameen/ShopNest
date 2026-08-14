/**
 * Database seed script — creates an admin user, the platform system vendor,
 * and sample categories/products (each with a VendorOffer, so they're
 * actually purchasable — Product itself carries no price/stock).
 * Run: pnpm --filter @shopnest/api db:seed
 *
 * Only creates records if they don't already exist (idempotent).
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_VENDOR_NAME, SYSTEM_VENDOR_SLUG } from '../src/catalog/system-vendor.constants';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@shopnest.dev';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';

  // SUPER_ADMIN, not ADMIN — the seeded account is the one and only admin
  // that exists before any `POST /admin/admins` call has ever run, so it
  // must be able to create further admin accounts itself (CRUD /admin/admins
  // is SUPER_ADMIN-only; see roles.guard.ts for the one-way ADMIN<-SUPER_ADMIN
  // hierarchy that still lets it do everything a plain ADMIN can too).
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: Role.SUPER_ADMIN, emailVerifiedAt: new Date() },
    });
    await prisma.cart.create({ data: { userId: admin.id } });
    console.log(`Super admin created: ${adminEmail}`);
  } else if (admin.role !== Role.SUPER_ADMIN) {
    admin = await prisma.user.update({ where: { id: admin.id }, data: { role: Role.SUPER_ADMIN } });
    console.log(`Promoted existing admin to SUPER_ADMIN: ${adminEmail}`);
  } else {
    console.log(`Super admin already exists: ${adminEmail}`);
  }

  const systemVendor = await prisma.vendor.upsert({
    where: { slug: SYSTEM_VENDOR_SLUG },
    update: {},
    create: {
      name: SYSTEM_VENDOR_NAME,
      slug: SYSTEM_VENDOR_SLUG,
      status: 'APPROVED',
      contactEmail: adminEmail,
      description: 'The platform-operated storefront — imported catalog and first-party listings.',
      approvedAt: new Date(),
    },
  });
  console.log(`System vendor ready: ${systemVendor.name}`);

  const categories = [
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Books', slug: 'books' },
    { name: 'Home & Garden', slug: 'home-garden' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log(`Categories seeded: ${categories.map((c) => c.name).join(', ')}`);

  const electronicsCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: 'electronics' },
  });

  const products = [
    {
      name: 'Wireless Noise-Cancelling Headphones',
      slug: 'wireless-noise-cancelling-headphones',
      description: 'Premium wireless headphones with active noise cancellation and 30-hour battery life.',
      priceCents: 29999,
      stockQuantity: 50,
      categoryId: electronicsCategory.id,
    },
    {
      name: 'Mechanical Keyboard',
      slug: 'mechanical-keyboard',
      description: 'Compact 75% mechanical keyboard with Cherry MX switches and per-key RGB lighting.',
      priceCents: 14999,
      stockQuantity: 30,
      categoryId: electronicsCategory.id,
    },
  ];

  for (const { priceCents, stockQuantity, ...productData } of products) {
    const product = await prisma.product.upsert({
      where: { slug: productData.slug },
      update: {},
      create: productData,
    });

    const offer = await prisma.vendorOffer.upsert({
      where: { vendorId_vendorSku: { vendorId: systemVendor.id, vendorSku: product.slug } },
      update: {},
      create: {
        vendorId: systemVendor.id,
        productId: product.id,
        vendorSku: product.slug,
        priceCents,
        stockQuantity,
        status: 'ACTIVE',
      },
    });

    if (stockQuantity > 0) {
      const alreadyRecorded = await prisma.inventoryAdjustment.findFirst({
        where: { vendorOfferId: offer.id, reason: 'IMPORT_INITIAL' },
      });
      if (!alreadyRecorded) {
        await prisma.inventoryAdjustment.create({
          data: {
            vendorOfferId: offer.id,
            delta: stockQuantity,
            reason: 'IMPORT_INITIAL',
            reference: `seed:${product.id}`,
          },
        });
      }
    }
  }
  console.log(`Products + offers seeded: ${products.map((p) => p.name).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
