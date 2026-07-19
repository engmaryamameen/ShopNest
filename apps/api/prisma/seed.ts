/**
 * Database seed script — creates an admin user and sample categories/products.
 * Run: pnpm --filter @shopnest/api exec ts-node prisma/seed.ts
 *
 * Only creates records if they don't already exist (idempotent).
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@shopnest.dev';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: Role.ADMIN },
    });
    await prisma.cart.create({ data: { userId: admin.id } });
    console.log(`Admin created: ${adminEmail}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

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

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
  }
  console.log(`Products seeded: ${products.map((p) => p.name).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
