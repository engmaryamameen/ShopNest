/**
 * Database seed script — a realistic multivendor demo dataset: the admin
 * account, the platform system vendor, three independent vendors (one with
 * a staff member), a brand/category spread, products offered by one or
 * several vendors, a demo customer with delivered orders and reviews on
 * them, and two promotions (platform- and vendor-scoped).
 *
 * Run: pnpm --filter @shopnest/api db:seed
 * Idempotent — safe to re-run; upserts by natural key throughout.
 */
import { PrismaClient, Role, VendorMemberRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_VENDOR_NAME, SYSTEM_VENDOR_SLUG } from '../src/catalog/system-vendor.constants.ts';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@ShopNest2025!';

async function upsertUser(email: string, role: Role, password = DEMO_PASSWORD) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { email, passwordHash, role, emailVerifiedAt: new Date() },
  });
  await prisma.cart.create({ data: { userId: user.id } });
  return user;
}

async function upsertVendor(params: {
  name: string;
  slug: string;
  contactEmail: string;
  description: string;
  ownerEmail: string;
}) {
  const owner = await upsertUser(params.ownerEmail, Role.VENDOR);
  const vendor = await prisma.vendor.upsert({
    where: { slug: params.slug },
    update: {},
    create: {
      name: params.name,
      slug: params.slug,
      status: 'APPROVED',
      contactEmail: params.contactEmail,
      description: params.description,
      approvedAt: new Date(),
    },
  });
  await prisma.vendorMember.upsert({
    where: { vendorId_userId: { vendorId: vendor.id, userId: owner.id } },
    update: {},
    create: { vendorId: vendor.id, userId: owner.id, role: VendorMemberRole.OWNER },
  });
  return vendor;
}

async function upsertOffer(params: {
  vendorId: string;
  productId: string;
  vendorSku: string;
  priceCents: number;
  compareAtPriceCents?: number;
  stockQuantity: number;
}) {
  const offer = await prisma.vendorOffer.upsert({
    where: { vendorId_vendorSku: { vendorId: params.vendorId, vendorSku: params.vendorSku } },
    update: {},
    create: {
      vendorId: params.vendorId,
      productId: params.productId,
      vendorSku: params.vendorSku,
      priceCents: params.priceCents,
      compareAtPriceCents: params.compareAtPriceCents,
      stockQuantity: params.stockQuantity,
      status: 'ACTIVE',
    },
  });
  const alreadyRecorded = await prisma.inventoryAdjustment.findFirst({
    where: { vendorOfferId: offer.id, reason: 'IMPORT_INITIAL' },
  });
  if (!alreadyRecorded && params.stockQuantity > 0) {
    await prisma.inventoryAdjustment.create({
      data: { vendorOfferId: offer.id, delta: params.stockQuantity, reason: 'IMPORT_INITIAL', reference: `seed:${offer.id}` },
    });
  }
  return offer;
}

/** Hand-constructs a DELIVERED order for one offer, mirroring exactly the
 * shape OrdersService.checkout() produces — so a seeded order looks
 * identical to a real one to every other part of the app, review
 * eligibility included. No row-locking here: seed runs alone, once,
 * against a controlled database, not under real concurrency. */
async function seedDeliveredOrder(params: {
  buyerId: string;
  vendorId: string;
  vendorName: string;
  offerId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  unitPriceCents: number;
  idempotencyKey: string;
}) {
  const existing = await prisma.order.findUnique({
    where: { Order_userId_idempotencyKey_key: { userId: params.buyerId, idempotencyKey: params.idempotencyKey } },
    include: { items: true },
  });
  if (existing) return existing.items[0];

  const totalCents = params.unitPriceCents * params.quantity;
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { userId: params.buyerId, totalCents, currency: 'USD', idempotencyKey: params.idempotencyKey, paymentRef: `seed_charge_${params.idempotencyKey}` },
    });
    const vendorOrder = await tx.vendorOrder.create({
      data: { orderId: order.id, vendorId: params.vendorId, subtotalCents: totalCents, status: 'DELIVERED' },
    });
    const item = await tx.orderItem.create({
      data: {
        orderId: order.id,
        vendorOrderId: vendorOrder.id,
        vendorOfferId: params.offerId,
        quantity: params.quantity,
        unitPriceCents: params.unitPriceCents,
        productName: params.productName,
        productSlug: params.productSlug,
        vendorName: params.vendorName,
      },
    });
    return item;
  });
}

async function seedReview(params: { productId: string; userId: string; orderItemId: string; rating: number; title: string; body: string }) {
  const existing = await prisma.review.findUnique({ where: { orderItemId: params.orderItemId } });
  if (existing) return;
  await prisma.$transaction(async (tx) => {
    await tx.review.create({
      data: {
        productId: params.productId,
        userId: params.userId,
        orderItemId: params.orderItemId,
        rating: params.rating,
        title: params.title,
        body: params.body,
      },
    });
    const agg = await tx.review.aggregate({
      where: { productId: params.productId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: true,
    });
    await tx.product.update({
      where: { id: params.productId },
      data: { ratingAverage: agg._avg.rating ?? 0, ratingCount: agg._count },
    });
  });
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@shopnest.dev';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';

  // SUPER_ADMIN, not ADMIN — the seeded account is the one and only admin
  // that exists before any `POST /admin/admins` call has ever run, so it
  // must be able to create further admin accounts itself.
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

  // ── Categories ─────────────────────────────────────────────────────────
  const categories = [
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Books', slug: 'books' },
    { name: 'Home & Garden', slug: 'home-garden' },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }
  const [electronics, clothing, books, home] = await Promise.all(
    categories.map((c) => prisma.category.findUniqueOrThrow({ where: { slug: c.slug } })),
  );
  console.log(`Categories seeded: ${categories.map((c) => c.name).join(', ')}`);

  // ── Brands ─────────────────────────────────────────────────────────────
  const brands = [
    { name: 'Aurora Audio', slug: 'aurora-audio' },
    { name: 'Northline Apparel', slug: 'northline-apparel' },
    { name: 'Fieldstone Press', slug: 'fieldstone-press' },
  ];
  for (const b of brands) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: {}, create: b });
  }
  const [auroraAudio, northlineApparel, fieldstonePress] = await Promise.all(
    brands.map((b) => prisma.brand.findUniqueOrThrow({ where: { slug: b.slug } })),
  );
  console.log(`Brands seeded: ${brands.map((b) => b.name).join(', ')}`);

  // ── Independent vendors ────────────────────────────────────────────────
  const acme = await upsertVendor({
    name: 'Acme Outdoor Co.',
    slug: 'acme-outdoor-co',
    contactEmail: 'sales@acme-outdoor.example',
    description: 'Outdoor gear and everyday carry, family-run since 2011.',
    ownerEmail: 'owner@acme-outdoor.example',
  });
  const acmeStaff = await upsertUser('staff@acme-outdoor.example', Role.VENDOR);
  await prisma.vendorMember.upsert({
    where: { vendorId_userId: { vendorId: acme.id, userId: acmeStaff.id } },
    update: {},
    create: { vendorId: acme.id, userId: acmeStaff.id, role: VendorMemberRole.STAFF },
  });

  const urbanThreads = await upsertVendor({
    name: 'Urban Threads',
    slug: 'urban-threads',
    contactEmail: 'hello@urbanthreads.example',
    description: 'Small-batch apparel from independent designers.',
    ownerEmail: 'owner@urbanthreads.example',
  });

  const techHub = await upsertVendor({
    name: 'TechHub Direct',
    slug: 'techhub-direct',
    contactEmail: 'support@techhubdirect.example',
    description: 'Consumer electronics at warehouse prices.',
    ownerEmail: 'owner@techhubdirect.example',
  });
  console.log(`Vendors seeded: ${acme.name}, ${urbanThreads.name}, ${techHub.name}`);

  // ── Products + offers ──────────────────────────────────────────────────
  // A few products are offered by more than one vendor, to show a real
  // multi-seller product page — same reason the search-path bug (Phase 5)
  // mattered: this shape has to actually exist in seed data to be tested.
  async function upsertProduct(data: { name: string; slug: string; description: string; categoryId: string; brandId?: string }) {
    return prisma.product.upsert({ where: { slug: data.slug }, update: {}, create: data });
  }

  const headphones = await upsertProduct({
    name: 'Wireless Noise-Cancelling Headphones',
    slug: 'wireless-noise-cancelling-headphones',
    description: 'Premium wireless headphones with active noise cancellation and 30-hour battery life.',
    categoryId: electronics.id,
    brandId: auroraAudio.id,
  });
  await upsertOffer({ vendorId: systemVendor.id, productId: headphones.id, vendorSku: headphones.slug, priceCents: 29999, compareAtPriceCents: 34999, stockQuantity: 40 });
  await upsertOffer({ vendorId: techHub.id, productId: headphones.id, vendorSku: `techhub-${headphones.slug}`, priceCents: 27999, stockQuantity: 15 });

  const keyboard = await upsertProduct({
    name: 'Mechanical Keyboard',
    slug: 'mechanical-keyboard',
    description: 'Compact 75% mechanical keyboard with Cherry MX switches and per-key RGB lighting.',
    categoryId: electronics.id,
  });
  await upsertOffer({ vendorId: systemVendor.id, productId: keyboard.id, vendorSku: keyboard.slug, priceCents: 14999, stockQuantity: 25 });
  await upsertOffer({ vendorId: techHub.id, productId: keyboard.id, vendorSku: `techhub-${keyboard.slug}`, priceCents: 13999, stockQuantity: 10 });

  const speaker = await upsertProduct({
    name: 'Portable Bluetooth Speaker',
    slug: 'portable-bluetooth-speaker',
    description: 'Waterproof speaker with 20-hour battery and rich bass for outdoor listening.',
    categoryId: electronics.id,
    brandId: auroraAudio.id,
  });
  await upsertOffer({ vendorId: techHub.id, productId: speaker.id, vendorSku: speaker.slug, priceCents: 8999, stockQuantity: 60 });

  const daypack = await upsertProduct({
    name: 'All-Weather Daypack 22L',
    slug: 'all-weather-daypack-22l',
    description: 'Water-resistant daypack with a padded laptop sleeve, built for daily commuting or day hikes.',
    categoryId: home.id,
  });
  await upsertOffer({ vendorId: acme.id, productId: daypack.id, vendorSku: daypack.slug, priceCents: 6999, stockQuantity: 35 });

  const waterBottle = await upsertProduct({
    name: 'Insulated Steel Water Bottle 750ml',
    slug: 'insulated-steel-water-bottle-750ml',
    description: 'Double-wall vacuum insulation keeps drinks cold 24 hours or hot for 12.',
    categoryId: home.id,
  });
  await upsertOffer({ vendorId: acme.id, productId: waterBottle.id, vendorSku: waterBottle.slug, priceCents: 2499, compareAtPriceCents: 2999, stockQuantity: 100 });
  await upsertOffer({ vendorId: systemVendor.id, productId: waterBottle.id, vendorSku: `direct-${waterBottle.slug}`, priceCents: 2699, stockQuantity: 50 });

  const tee = await upsertProduct({
    name: 'Organic Cotton Crewneck Tee',
    slug: 'organic-cotton-crewneck-tee',
    description: 'Heavyweight organic cotton tee, garment-dyed for a soft, lived-in feel.',
    categoryId: clothing.id,
    brandId: northlineApparel.id,
  });
  await upsertOffer({ vendorId: urbanThreads.id, productId: tee.id, vendorSku: tee.slug, priceCents: 3200, stockQuantity: 80 });

  const jacket = await upsertProduct({
    name: 'Packable Rain Jacket',
    slug: 'packable-rain-jacket',
    description: 'Lightweight, fully seam-sealed shell that packs into its own pocket.',
    categoryId: clothing.id,
    brandId: northlineApparel.id,
  });
  await upsertOffer({ vendorId: urbanThreads.id, productId: jacket.id, vendorSku: jacket.slug, priceCents: 8900, compareAtPriceCents: 11000, stockQuantity: 20 });

  const novel = await upsertProduct({
    name: 'The Long Passage — a novel',
    slug: 'the-long-passage-novel',
    description: 'A quiet, sweeping story of three siblings across four decades.',
    categoryId: books.id,
    brandId: fieldstonePress.id,
  });
  await upsertOffer({ vendorId: systemVendor.id, productId: novel.id, vendorSku: novel.slug, priceCents: 1899, stockQuantity: 70 });

  const cookbook = await upsertProduct({
    name: 'Weeknight: 100 Fast, Real Dinners',
    slug: 'weeknight-100-fast-real-dinners',
    description: 'A cookbook built entirely around 30-minutes-or-less, few-ingredient meals.',
    categoryId: books.id,
    brandId: fieldstonePress.id,
  });
  await upsertOffer({ vendorId: systemVendor.id, productId: cookbook.id, vendorSku: cookbook.slug, priceCents: 2499, stockQuantity: 45 });

  const deskLamp = await upsertProduct({
    name: 'Adjustable LED Desk Lamp',
    slug: 'adjustable-led-desk-lamp',
    description: 'Stepless dimming, five color temperatures, USB-C charging port in the base.',
    categoryId: home.id,
  });
  await upsertOffer({ vendorId: techHub.id, productId: deskLamp.id, vendorSku: deskLamp.slug, priceCents: 3999, stockQuantity: 55 });

  console.log('Products + offers seeded (11 products, 3 multi-seller).');

  // ── Promotions ─────────────────────────────────────────────────────────
  const inAWhile = new Date();
  inAWhile.setFullYear(inAWhile.getFullYear() + 1);
  const aWhileAgo = new Date();
  aWhileAgo.setFullYear(aWhileAgo.getFullYear() - 1);

  await prisma.promotion.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      scope: 'PLATFORM',
      startsAt: aWhileAgo,
      endsAt: inAWhile,
      minSubtotalCents: 5000,
      createdByUserId: admin.id,
    },
  });
  await prisma.promotion.upsert({
    where: { code: 'ACMEGEAR5' },
    update: {},
    create: {
      code: 'ACMEGEAR5',
      type: 'FIXED_AMOUNT',
      value: 500,
      scope: 'VENDOR',
      vendorId: acme.id,
      startsAt: aWhileAgo,
      endsAt: inAWhile,
      createdByUserId: admin.id,
    },
  });
  console.log('Promotions seeded: WELCOME10 (platform), ACMEGEAR5 (Acme Outdoor Co.)');

  // ── Demo customer, delivered orders, reviews ──────────────────────────
  const customer = await upsertUser('customer@shopnest.dev', Role.CUSTOMER);

  const headphoneOffer = await prisma.vendorOffer.findUniqueOrThrow({
    where: { vendorId_vendorSku: { vendorId: systemVendor.id, vendorSku: headphones.slug } },
  });
  const headphoneItem = await seedDeliveredOrder({
    buyerId: customer.id,
    vendorId: systemVendor.id,
    vendorName: systemVendor.name,
    offerId: headphoneOffer.id,
    productName: headphones.name,
    productSlug: headphones.slug,
    quantity: 1,
    unitPriceCents: headphoneOffer.priceCents,
    idempotencyKey: 'seed-order-headphones',
  });
  await seedReview({
    productId: headphones.id,
    userId: customer.id,
    orderItemId: headphoneItem.id,
    rating: 5,
    title: 'Excellent sound and battery life',
    body: 'These have been my daily pair for weeks now — noise cancellation is genuinely effective on flights, and a single charge lasts the whole work week.',
  });

  const jacketOffer = await prisma.vendorOffer.findUniqueOrThrow({
    where: { vendorId_vendorSku: { vendorId: urbanThreads.id, vendorSku: jacket.slug } },
  });
  const jacketItem = await seedDeliveredOrder({
    buyerId: customer.id,
    vendorId: urbanThreads.id,
    vendorName: urbanThreads.name,
    offerId: jacketOffer.id,
    productName: jacket.name,
    productSlug: jacket.slug,
    quantity: 1,
    unitPriceCents: jacketOffer.priceCents,
    idempotencyKey: 'seed-order-jacket',
  });
  await seedReview({
    productId: jacket.id,
    userId: customer.id,
    orderItemId: jacketItem.id,
    rating: 4,
    title: 'Packs down small, kept me dry',
    body: 'Used it on a rainy trail weekend — seams held up fine. Only reason it is not five stars is the pocket zipper feels a little flimsy.',
  });

  console.log(`Demo customer ready: ${customer.email} (2 delivered orders, 2 reviews)`);

  console.log('\nSeed complete. Demo accounts (all share one password unless noted):');
  console.log(`  Admin:               ${adminEmail} / ${adminPassword}`);
  console.log(`  Customer:            customer@shopnest.dev / ${DEMO_PASSWORD}`);
  console.log(`  Acme Outdoor (owner): owner@acme-outdoor.example / ${DEMO_PASSWORD}`);
  console.log(`  Acme Outdoor (staff): staff@acme-outdoor.example / ${DEMO_PASSWORD}`);
  console.log(`  Urban Threads (owner): owner@urbanthreads.example / ${DEMO_PASSWORD}`);
  console.log(`  TechHub Direct (owner): owner@techhubdirect.example / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
