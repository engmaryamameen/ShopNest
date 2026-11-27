import { PrismaClient } from '@prisma/client';
import { DemoCatalogService } from '../src/admin/demo-catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const service = new DemoCatalogService(prisma as unknown as PrismaService);
const markerId = '0a310000-0000-4000-8000-000000000001';
const originalEnv = { ...process.env };

beforeAll(() => { if (process.env.NODE_ENV !== 'test' || process.env.SHOPNEST_DISPOSABLE_DB !== 'true') throw new Error('A designated disposable test database is required.'); });

afterAll(async () => { process.env = originalEnv; await prisma.$disconnect(); });

describe('demo catalog (dedicated empty test database)', () => {
  it('is unavailable by default and even with the flag in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_CATALOG_ENABLED = 'true';
    await expect(service.apply()).rejects.toThrow('not available');
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_CATALOG_ENABLED;
    await expect(service.apply()).rejects.toThrow('not available');
    expect(await prisma.vendor.findUnique({ where: { id: markerId } })).toBeNull();
  });

  it('rolls back the complete fixture on a collision and permits a later retry', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_CATALOG_ENABLED = 'true';
    const collision = await prisma.category.create({ data: { name: 'Unrelated synthetic category', slug: 'shopnest-demo-desk-accessories' } });
    await expect(service.apply()).rejects.toThrow('already in use');
    expect(await prisma.vendor.findUnique({ where: { id: markerId } })).toBeNull();
    expect(await prisma.vendor.findUnique({ where: { slug: 'shopnest-demo-workshop' } })).toBeNull();
    // Resolve only the synthetic test collision; no existing user data is touched.
    await prisma.category.update({ where: { id: collision.id }, data: { slug: 'test-collision-resolved' } });
  });

  it('serializes concurrent requests and never resets modified stock or changes accounts', async () => {
    await prisma.user.create({ data: { email: 'demo-existing-user@example.test', passwordHash: 'unusable-test-only-hash', role: 'CUSTOMER' } });
    const usersBefore = await prisma.user.findMany({ select: { id: true, role: true }, orderBy: { id: 'asc' } });
    const results = await Promise.all([service.apply(), service.apply()]);
    expect(results.map((r) => r.result).sort()).toEqual(['already_applied', 'created']);
    const offer = await prisma.vendorOffer.findFirstOrThrow({ where: { vendorSku: 'shopnest-demo-grid-notebook' } });
    await prisma.vendorOffer.update({ where: { id: offer.id }, data: { stockQuantity: 7 } });
    expect((await service.apply()).result).toBe('already_applied');
    expect((await prisma.vendorOffer.findUniqueOrThrow({ where: { id: offer.id } })).stockQuantity).toBe(7);
    expect(await prisma.user.findMany({ select: { id: true, role: true }, orderBy: { id: 'asc' } })).toEqual(usersBefore);
    expect(await prisma.vendor.count({ where: { slug: { startsWith: 'shopnest-demo-' } } })).toBe(2);
  });
});
