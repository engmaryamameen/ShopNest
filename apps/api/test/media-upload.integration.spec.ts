import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp } from '../src/main';
import { pngBuffer, svgBuffer } from '../src/media/__tests__/fixtures';
import { captureSignupCodes, registerTestUser } from './signup-helper';

const prisma = new PrismaClient();
let app: INestApplication;
let base: string;
let uploadDir: string;
let testUserId: string | undefined;
let signupCodes: Map<string, string>;
const origin = process.env.WEB_URL ?? 'http://localhost:3000';

beforeAll(async () => {
  if (process.env.SHOPNEST_DISPOSABLE_DB !== 'true' || process.env.NODE_ENV !== 'test') {
    throw new Error('Media integration tests require an explicitly designated disposable database.');
  }
  uploadDir = await mkdtemp(join(tmpdir(), 'shopnest-upload-test-'));
  process.env.MEDIA_UPLOAD_DIR = uploadDir;
  process.env.CATALOG_WORKER_ENABLED = 'false';
  process.env.CATALOG_SCHEDULE_ENABLED = 'false';
  app = await createApp();
  signupCodes = captureSignupCodes(app);
  await app.listen(0);
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
  if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } });
  await prisma.$disconnect();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

function uploadBody(bytes: Buffer, mime: string) {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(bytes)], { type: mime }), 'image.png');
  return form;
}

it('authorizes multipart uploads and validates their actual contents', async () => {
  const unauthenticated = await fetch(`${base}/admin/media/upload`, {
    method: 'POST', headers: { origin }, body: uploadBody(pngBuffer(), 'image/png'),
  });
  expect([401, 403]).toContain(unauthenticated.status);

  const email = `upload-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-aA1!`;
  const headers = { 'content-type': 'application/json', origin };
  const registered = await registerTestUser(base, origin, email, password, signupCodes);
  expect(registered.status).toBe(201);
  testUserId = (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const customerCookies = registered.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const customer = await fetch(`${base}/admin/media/upload`, {
    method: 'POST', headers: { origin, cookie: customerCookies }, body: uploadBody(pngBuffer(), 'image/png'),
  });
  expect(customer.status).toBe(403);

  await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  expect(login.status).toBe(200);
  const adminCookies = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const uploaded = await fetch(`${base}/admin/media/upload`, {
    method: 'POST', headers: { origin, cookie: adminCookies }, body: uploadBody(pngBuffer(), 'image/png'),
  });
  expect(uploaded.status).toBe(201);
  const invalid = await fetch(`${base}/admin/media/upload`, {
    method: 'POST', headers: { origin, cookie: adminCookies }, body: uploadBody(svgBuffer, 'image/png'),
  });
  expect(invalid.status).toBe(400);
});
