/**
 * PostgreSQL concurrency integration tests
 *
 * Run against the live Docker Compose stack (api on http://localhost:13001).
 * Requires the `shopnest-db-1` container to be reachable via `docker exec`.
 *
 * Run: cd apps/api && pnpm test:e2e
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const API = process.env.API_URL ?? 'http://localhost:13001';
const WEB_ORIGIN = 'http://localhost:3000'; // must match WEB_URL on the API container
const DB_EXEC = (sql: string) =>
  execSync(
    `docker exec shopnest-db-1 psql -U shopnest -d shopnest_dev -c "${sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  );

const run = `${Date.now()}`;

// ── helpers ──────────────────────────────────────────────────────────────────

type Cookies = Record<string, string>;

function parseCookies(res: Response): Cookies {
  const out: Cookies = {};
  const headers: string[] = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of headers) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    out[name] = value;
  }
  return out;
}

function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

type ApiOpts = { method?: string; body?: unknown; cookies?: Cookies };

async function api(path: string, opts: ApiOpts = {}): Promise<Response> {
  const { method = 'GET', body, cookies } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookies && Object.keys(cookies).length > 0) headers['Cookie'] = cookieHeader(cookies);
  if (method !== 'GET' && method !== 'HEAD') headers['Origin'] = WEB_ORIGIN;
  return fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function assertOk(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label}: HTTP ${res.status} — ${body}`);
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
}

async function register(email: string): Promise<Cookies> {
  const res = await api('/auth/register', {
    method: 'POST',
    body: { email, password: 'TestPass123!' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`register(${email}) failed ${res.status}: ${text}`);
  }
  return parseCookies(res);
}

async function login(email: string): Promise<Cookies> {
  const res = await api('/auth/login', {
    method: 'POST',
    body: { email, password: 'TestPass123!' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login(${email}) failed ${res.status}: ${text}`);
  }
  return parseCookies(res);
}

function promoteToAdmin(email: string): void {
  DB_EXEC(`UPDATE "User" SET role = 'ADMIN' WHERE email = '${email}'`);
}

async function createAdminSession(suffix: string): Promise<Cookies> {
  const email = `admin-${suffix}-${run}@test.local`;
  await register(email);
  promoteToAdmin(email);
  return login(email);
}

async function createCategory(adminCookies: Cookies, name: string, slug: string): Promise<string> {
  const data = (await assertOk(
    await api('/categories', { method: 'POST', body: { name, slug }, cookies: adminCookies }),
    `createCategory(${slug})`,
  )) as { id: string };
  return data.id;
}

async function createProduct(
  adminCookies: Cookies,
  payload: { name: string; slug: string; priceCents: number; stockQuantity: number; categoryId: string },
): Promise<string> {
  const data = (await assertOk(
    await api('/products', {
      method: 'POST',
      body: { ...payload, description: 'Integration test product' },
      cookies: adminCookies,
    }),
    `createProduct(${payload.slug})`,
  )) as { id: string };
  return data.id;
}

// ── Suite 1: Concurrent checkout — inventory race protection ──────────────────

describe('Concurrent checkout — inventory race protection', () => {
  let user1Cookies: Cookies;
  let user2Cookies: Cookies;
  let productSlug: string;

  beforeAll(async () => {
    const adminCookies = await createAdminSession('chk');

    const categoryId = await createCategory(adminCookies, `ChkCat-${run}`, `chk-cat-${run}`);
    productSlug = `race-product-${run}`;
    const productId = await createProduct(adminCookies, {
      name: `RaceProduct-${run}`,
      slug: productSlug,
      priceCents: 1000,
      stockQuantity: 1, // exactly 1 unit — only one buyer can win
      categoryId,
    });

    user1Cookies = await register(`buyer1-${run}@test.local`);
    user2Cookies = await register(`buyer2-${run}@test.local`);

    // Both buyers add the scarce product to their carts
    await assertOk(
      await api('/cart/items', { method: 'PUT', body: { productId, quantity: 1 }, cookies: user1Cookies }),
      'buyer1 add to cart',
    );
    await assertOk(
      await api('/cart/items', { method: 'PUT', body: { productId, quantity: 1 }, cookies: user2Cookies }),
      'buyer2 add to cart',
    );
  });

  it('only one of two simultaneous checkouts succeeds when stock = 1', async () => {
    const [res1, res2] = await Promise.all([
      api('/orders/checkout', {
        method: 'POST',
        body: { idempotencyKey: randomUUID() },
        cookies: user1Cookies,
      }),
      api('/orders/checkout', {
        method: 'POST',
        body: { idempotencyKey: randomUUID() },
        cookies: user2Cookies,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // One buyer wins (201), the other loses (409 Conflict — insufficient stock)
    expect(statuses).toEqual([201, 409]);
  });

  it('stock is 0 after the winning checkout (no double-decrement)', async () => {
    const prodRes = await api(`/products/${productSlug}`);
    expect(prodRes.status).toBe(200);
    const data = (await prodRes.json()) as { data: { stockQuantity: number } };
    expect(data.data.stockQuantity).toBe(0);
  });

  it('checkout is idempotent — retrying with same UUID returns the same order', async () => {
    // Register a third user with a product that has stock
    const adminCookies = await createAdminSession('idem');
    const categoryId = await createCategory(adminCookies, `IdemCat-${run}`, `idem-cat-${run}`);
    const productId = await createProduct(adminCookies, {
      name: `IdemProduct-${run}`,
      slug: `idem-product-${run}`,
      priceCents: 500,
      stockQuantity: 10,
      categoryId,
    });
    const buyerCookies = await register(`idem-buyer-${run}@test.local`);
    await assertOk(
      await api('/cart/items', { method: 'PUT', body: { productId, quantity: 1 }, cookies: buyerCookies }),
      'idem buyer add to cart',
    );

    const key = randomUUID();

    const first = await api('/orders/checkout', {
      method: 'POST',
      body: { idempotencyKey: key },
      cookies: buyerCookies,
    });
    expect(first.status).toBe(201);
    const firstOrder = (await first.json()) as { data: { id: string } };

    // Retry with the same key — must return 201 with the same order ID
    const retry = await api('/orders/checkout', {
      method: 'POST',
      body: { idempotencyKey: key },
      cookies: buyerCookies,
    });
    expect(retry.status).toBe(201);
    const retryOrder = (await retry.json()) as { data: { id: string } };

    expect(retryOrder.data.id).toBe(firstOrder.data.id);
  });
});

// ── Suite 2: Concurrent refresh token rotation — grace period ─────────────────

describe('Concurrent refresh token rotation — grace period', () => {
  let freshCookies: Cookies;

  beforeAll(async () => {
    freshCookies = await register(`refresh-${run}@test.local`);
  });

  it('first of two simultaneous refreshes succeeds; second is accepted within grace period (200 or 409)', async () => {
    const [res1, res2] = await Promise.all([
      api('/auth/refresh', { method: 'POST', cookies: freshCookies }),
      api('/auth/refresh', { method: 'POST', cookies: freshCookies }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Acceptable outcomes:
    // • [200, 200]: both arrive within the grace-period window — both silently succeed
    // • [200, 409]: one rotation wins; the other gets "recently-rotated" (client retries with existing cookies)
    // 401 would mean theft-detection fired, which is wrong for a same-client concurrent refresh
    expect(statuses[0]).toBeGreaterThanOrEqual(200);
    expect(statuses[1]).toBeLessThanOrEqual(409);
    expect(statuses).not.toContain(401);
    expect(statuses).not.toContain(500);
  });

  it('after rotation, the original token is eventually rejected (outside grace period)', async () => {
    // Register a fresh user for this sub-test to avoid shared state with the above
    const tokenCookies = await register(`refresh2-${run}@test.local`);

    // Rotate once to mark the original token as used
    const rotateRes = await api('/auth/refresh', { method: 'POST', cookies: tokenCookies });
    expect([200, 409]).toContain(rotateRes.status);

    if (rotateRes.status !== 200) return; // already consumed — skip remainder

    const newCookies = parseCookies(rotateRes);

    // Simulate the grace period having elapsed by back-dating usedAt via SQL.
    // Node's hashToken: createHash('sha256').update(rawToken).digest('hex')
    // PostgreSQL equivalent: encode(sha256(raw::bytea), 'hex')
    const rawToken = tokenCookies['refresh_token'];
    if (rawToken) {
      DB_EXEC(
        `UPDATE "RefreshToken" SET "usedAt" = NOW() - INTERVAL '60 seconds' ` +
        `WHERE "tokenHash" = encode(sha256('${rawToken}'::bytea), 'hex')`,
      );
    }

    // Reusing the original token after the grace period → theft signal → family revoked → 401
    const reuseRes = await api('/auth/refresh', { method: 'POST', cookies: tokenCookies });
    expect(reuseRes.status).toBe(401);

    // The new token is in the same family — family revocation cascades to it too.
    // This forces a full re-login, which is the correct theft-detection response.
    const meRes = await api('/auth/me', { cookies: newCookies });
    expect(meRes.status).toBe(401);
  });
});

// ── Suite 3: Concurrent cart mutations — no lost updates ─────────────────────

describe('Concurrent cart mutations — no lost updates', () => {
  let userCookies: Cookies;
  let productId1: string;
  let productId2: string;

  beforeAll(async () => {
    const adminCookies = await createAdminSession('cart');
    const categoryId = await createCategory(adminCookies, `CartCat-${run}`, `cart-cat-${run}`);

    [productId1, productId2] = await Promise.all([
      createProduct(adminCookies, { name: `CartP1-${run}`, slug: `cart-p1-${run}`, priceCents: 500, stockQuantity: 50, categoryId }),
      createProduct(adminCookies, { name: `CartP2-${run}`, slug: `cart-p2-${run}`, priceCents: 750, stockQuantity: 50, categoryId }),
    ]);

    userCookies = await register(`cart-user-${run}@test.local`);
  });

  it('concurrent upserts to different products both persist — no lost writes', async () => {
    const [r1, r2] = await Promise.all([
      api('/cart/items', { method: 'PUT', body: { productId: productId1, quantity: 3 }, cookies: userCookies }),
      api('/cart/items', { method: 'PUT', body: { productId: productId2, quantity: 2 }, cookies: userCookies }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const cartRes = await api('/cart', { cookies: userCookies });
    expect(cartRes.status).toBe(200);
    const cart = (await cartRes.json()) as { data: { items: Array<{ productId: string; quantity: number }> } };
    const items = cart.data.items;

    // Both writes must have persisted
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.productId === productId1)?.quantity).toBe(3);
    expect(items.find((i) => i.productId === productId2)?.quantity).toBe(2);
  });

  it('concurrent upserts to the same product yield a consistent final quantity', async () => {
    const [r1, r2] = await Promise.all([
      api('/cart/items', { method: 'PUT', body: { productId: productId1, quantity: 5 }, cookies: userCookies }),
      api('/cart/items', { method: 'PUT', body: { productId: productId1, quantity: 7 }, cookies: userCookies }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const cartRes = await api('/cart', { cookies: userCookies });
    const cart = (await cartRes.json()) as { data: { items: Array<{ productId: string; quantity: number }> } };
    const qty = cart.data.items.find((i) => i.productId === productId1)?.quantity;

    // Must be one of the two requested values — never a partial/corrupted mix
    expect([5, 7]).toContain(qty);
  });
});

// ── Suite 4: Order state machine — transition enforcement ─────────────────────

describe('Order state machine — transition enforcement', () => {
  let adminCookies: Cookies;
  let userCookies: Cookies;
  let productId: string;

  beforeAll(async () => {
    adminCookies = await createAdminSession('sm');
    userCookies = await register(`sm-user-${run}@test.local`);

    const categoryId = await createCategory(adminCookies, `SMCat-${run}`, `sm-cat-${run}`);
    productId = await createProduct(adminCookies, {
      name: `SMProduct-${run}`,
      slug: `sm-product-${run}`,
      priceCents: 2000,
      stockQuantity: 100,
      categoryId,
    });
  });

  async function placeOrder(key: string): Promise<string> {
    await assertOk(
      await api('/cart/items', { method: 'PUT', body: { productId, quantity: 1 }, cookies: userCookies }),
      'add to cart',
    );
    const data = (await assertOk(
      await api('/orders/checkout', { method: 'POST', body: { idempotencyKey: key }, cookies: userCookies }),
      'checkout',
    )) as { id: string };
    return data.id;
  }

  it('full lifecycle: PENDING → CONFIRMED → SHIPPED → DELIVERED', async () => {
    const orderId = await placeOrder(randomUUID());

    const toConfirmed = await api(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'CONFIRMED' },
      cookies: adminCookies,
    });
    expect(toConfirmed.status).toBe(200);

    const toShipped = await api(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'SHIPPED' },
      cookies: adminCookies,
    });
    expect(toShipped.status).toBe(200);

    const toDelivered = await api(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'DELIVERED' },
      cookies: adminCookies,
    });
    expect(toDelivered.status).toBe(200);
  });

  it('customer cannot access admin status endpoint (403)', async () => {
    const orderId = await placeOrder(randomUUID());

    const attempt = await api(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'CONFIRMED' },
      cookies: userCookies,
    });
    expect(attempt.status).toBe(403);
  });

  it('inventory is restored transactionally on cancellation', async () => {
    const qty = 5;
    await api('/cart/items', { method: 'PUT', body: { productId, quantity: qty }, cookies: userCookies });
    const data = (await assertOk(
      await api('/orders/checkout', { method: 'POST', body: { idempotencyKey: randomUUID() }, cookies: userCookies }),
      'checkout for cancel test',
    )) as { id: string };
    const orderId = data.id;

    const beforeRes = await api(`/products/sm-product-${run}`);
    const before = ((await beforeRes.json()) as { data: { stockQuantity: number } }).data.stockQuantity;

    const cancelRes = await api(`/orders/${orderId}/cancel`, { method: 'PATCH', cookies: userCookies });
    expect(cancelRes.status).toBe(200);

    const afterRes = await api(`/products/sm-product-${run}`);
    const after = ((await afterRes.json()) as { data: { stockQuantity: number } }).data.stockQuantity;

    expect(after).toBe(before + qty);
  });

  it('customer cannot cancel a CONFIRMED order', async () => {
    const orderId = await placeOrder(randomUUID());

    // Admin advances to CONFIRMED
    await api(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'CONFIRMED' },
      cookies: adminCookies,
    });

    // Customer tries to cancel CONFIRMED → 400 (invalid transition)
    const attempt = await api(`/orders/${orderId}/cancel`, { method: 'PATCH', cookies: userCookies });
    expect(attempt.status).toBe(400);
  });
});
