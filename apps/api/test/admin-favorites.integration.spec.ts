import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { createApp } from '../src/main';
import { AuthService } from '../src/auth/auth.service';

const enabled = process.env.SHOPNEST_DISPOSABLE_DB === 'true' && /\/(?:shopnest_signup_test_[a-zA-Z0-9_]+|shopnest_test)(?:\?|$)/.test(process.env.DATABASE_URL ?? '');

(enabled ? describe : describe.skip)('admin favorites', () => {
  const prisma = new PrismaClient();
  const ids: string[] = [];
  let app: INestApplication;
  let adminA: string;
  let adminB: string;
  let customer: string;

  async function session(role: Role): Promise<string> {
    const user = await prisma.user.create({ data: { email: `favorites-${randomUUID()}@example.test`, passwordHash: 'unused', role } });
    ids.push(user.id);
    const auth = app.get(AuthService);
    const family = await auth.createVerifiedSignupSession(user.id, {});
    return auth.signAccessToken({ sub: user.id, email: user.email, role, familyId: family.familyId });
  }

  beforeAll(async () => {
    process.env.CATALOG_WORKER_ENABLED = 'false';
    process.env.CATALOG_SCHEDULE_ENABLED = 'false';
    app = await createApp();
    await app.init();
    adminA = await session(Role.ADMIN);
    adminB = await session(Role.SUPER_ADMIN);
    customer = await session(Role.CUSTOMER);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    await prisma.$disconnect();
  });

  it('stores favorites per account and handles repeated requests', async () => {
    const server = app.getHttpServer();
    const origin = 'http://localhost:3000';
    const body = { path: '/admin/orders' };
    await request(server).put('/admin/favorites').set('Origin', origin).auth(adminA, { type: 'bearer' }).send(body).expect(204);
    await request(server).put('/admin/favorites').set('Origin', origin).auth(adminA, { type: 'bearer' }).send(body).expect(204);
    const first = await request(server).get('/admin/favorites').auth(adminA, { type: 'bearer' }).expect(200);
    expect(first.body.data).toEqual(['/admin/orders']);
    const other = await request(server).get('/admin/favorites').auth(adminB, { type: 'bearer' }).expect(200);
    expect(other.body.data).toEqual([]);
    await request(server).delete('/admin/favorites').set('Origin', origin).auth(adminB, { type: 'bearer' }).send(body).expect(204);
    const unchanged = await request(server).get('/admin/favorites').auth(adminA, { type: 'bearer' }).expect(200);
    expect(unchanged.body.data).toEqual(['/admin/orders']);
    await request(server).delete('/admin/favorites').set('Origin', origin).auth(adminA, { type: 'bearer' }).send(body).expect(204);
    const removed = await request(server).get('/admin/favorites').auth(adminA, { type: 'bearer' }).expect(200);
    expect(removed.body.data).toEqual([]);
  });

  it('rejects anonymous users, customers and invalid paths', async () => {
    const server = app.getHttpServer();
    await request(server).get('/admin/favorites').expect(401);
    await request(server).get('/admin/favorites').auth(customer, { type: 'bearer' }).expect(403);
    await request(server).put('/admin/favorites').set('Origin', 'http://localhost:3000').auth(adminA, { type: 'bearer' }).send({ path: 'https://example.com' }).expect(400);
  });
});
