import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createApp } from '../src/main';

const prisma = new PrismaClient();
const originalEnv = { ...process.env };
let app: INestApplication;
let base: string;
let testUserId: string | undefined;

beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test' || process.env.SHOPNEST_DISPOSABLE_DB !== 'true') throw new Error('A designated disposable test database is required.');
  process.env.NODE_ENV = 'development';
  process.env.DEMO_CATALOG_ENABLED = 'true';
  process.env.CATALOG_WORKER_ENABLED = 'false';
  process.env.CATALOG_SCHEDULE_ENABLED = 'false';
  app = await createApp();
  await app.listen(0);
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => { await app?.close(); if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } }); await prisma.$disconnect(); process.env = originalEnv; });

it('requires authentication and the administrator role on the actual endpoint', async () => {
  const origin = process.env.WEB_URL ?? 'http://localhost:3000';
  const headers = { 'content-type': 'application/json', origin };
  const anonymous = await fetch(`${base}/admin/demo-catalog`, { method: 'POST', headers });
  expect([401, 403]).toContain(anonymous.status);

  const email = `demo-access-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-aA1!`;
  const registered = await fetch(`${base}/auth/register`, { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  expect(registered.status).toBe(201);
  testUserId = (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const customerCookies = registered.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const customer = await fetch(`${base}/admin/demo-catalog`, { method: 'POST', headers: { ...headers, cookie: customerCookies } });
  expect(customer.status).toBe(403);

  // Promotion is test setup for this newly registered synthetic account, not demo action behavior.
  await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  expect(login.status).toBe(200);
  const adminCookies = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const admin = await fetch(`${base}/admin/demo-catalog`, { method: 'POST', headers: { ...headers, cookie: adminCookies } });
  expect(admin.status).toBe(201);
  expect(['created', 'already_applied']).toContain((await admin.json() as { data: { result: string } }).data.result);
  process.env.NODE_ENV = 'production';
  const production = await fetch(`${base}/admin/demo-catalog`, { method: 'POST', headers: { ...headers, cookie: adminCookies } });
  expect(production.status).toBe(404);
});
