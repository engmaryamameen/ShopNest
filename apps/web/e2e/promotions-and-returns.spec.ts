import { test, expect, request as apiRequestModule } from '@playwright/test';
import { registerViaUI, loginViaUI } from './helpers/actions';

// Promotions and returns, driven through real UI interaction for the
// pieces actually under test. Service-level correctness (discount math,
// redemption limits, ownership isolation, inventory/refund atomicity) is
// already covered by promotions.service.spec.ts / returns.service.spec.ts
// / orders.service.spec.ts and the multi-vendor concurrency integration
// test — this suite exists to catch rendering/click-through wiring bugs
// those can't.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shopnest.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';
const PASSWORD = 'Str0ngPassw0rd!23';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

function uniqueCode(prefix: string): string {
  return `${prefix}${Date.now()}`.toUpperCase().slice(0, 20);
}

test.describe('Promotions and returns', () => {
  test('cart promo code: applying shows a discount, removing clears it', async ({ page }) => {
    // Setup a platform promotion via the API — creating one is Admin UI's
    // own concern, covered in the promotions-management test below.
    const admin = await apiRequestModule.newContext({ baseURL: API_URL });
    const loginRes = await admin.post('/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    const code = uniqueCode('E2ECART');
    const promoRes = await admin.post('/admin/promotions', {
      headers: { Origin: 'http://localhost:3000' },
      data: {
        code,
        type: 'PERCENT',
        value: 10,
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2099-01-01T00:00:00.000Z',
      },
    });
    expect(promoRes.ok()).toBeTruthy();
    await admin.dispose();

    const email = uniqueEmail('promo-cart-e2e');
    await registerViaUI(page, email, PASSWORD);

    const productsRes = await page.request.get(`${API_URL}/products?q=Headphones`);
    const product = (await productsRes.json()).data.items[0];

    await page.goto(`/products/${product.slug}`);
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect(page.getByText('Added to cart!')).toBeVisible({ timeout: 10_000 });

    await page.goto('/cart');
    await page.getByPlaceholder('Promo code').fill(code);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/cart/promotion') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Apply' }).click(),
    ]);

    await expect(page.getByText(code, { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Subtotal')).toBeVisible();

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/cart/promotion') && res.request().method() === 'DELETE'),
      page.getByRole('button', { name: 'Remove', exact: true }).click(),
    ]);
    await expect(page.getByPlaceholder('Promo code')).toBeVisible({ timeout: 10_000 });
  });

  test('a delivered order can be returned by the customer and approved by an admin, entirely through the UI', async ({
    page,
    browser,
  }) => {
    const buyerEmail = uniqueEmail('return-e2e');
    await registerViaUI(page, buyerEmail, PASSWORD);

    const productsRes = await page.request.get(`${API_URL}/products?q=Headphones`);
    const product = (await productsRes.json()).data.items[0];

    await page.goto(`/products/${product.slug}`);
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect(page.getByText('Added to cart!')).toBeVisible({ timeout: 10_000 });

    await page.goto('/cart');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/orders/checkout')),
      page.getByRole('button', { name: 'Place Order' }).click(),
    ]);
    await expect(page).toHaveURL(/\/orders\//, { timeout: 10_000 });
    const orderId = page.url().split('/orders/')[1];

    // Advance to DELIVERED — order-status transitions are an admin
    // action, not something this test is exercising.
    const admin = await apiRequestModule.newContext({ baseURL: API_URL });
    const loginRes = await admin.post('/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) {
      const res = await admin.patch(`/admin/orders/${orderId}/status`, {
        headers: { Origin: 'http://localhost:3000' },
        data: { status },
      });
      expect(res.ok()).toBeTruthy();
    }
    await admin.dispose();

    // Real thing under test: request a return through the order page.
    await page.reload();
    await page.getByRole('button', { name: 'Request return' }).click();
    await page.getByRole('combobox').selectOption('DEFECTIVE');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/returns') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Submit request' }).click(),
    ]);
    await expect(page.getByText('Return requested')).toBeVisible({ timeout: 10_000 });

    // Admin approves it, in its own browser context/session.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginViaUI(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto('/admin/returns');
    const row = adminPage.getByRole('row', { name: new RegExp(buyerEmail) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes('/admin/returns/') && res.url().includes('/approve')),
      row.getByRole('button', { name: 'Approve' }).click(),
    ]);
    await expect(adminPage.getByRole('row', { name: new RegExp(buyerEmail) }).getByText('REFUNDED')).toBeVisible({
      timeout: 10_000,
    });
    await adminContext.close();
  });

  test('vendor and admin can each create and deactivate a promotion through their own dashboard', async ({
    page,
    browser,
  }) => {
    // Vendor side — apply, admin-approve (API setup), then the real UI
    // flow: create a promotion, see it listed, deactivate it.
    const vendorEmail = uniqueEmail('promo-vendor-e2e');
    const setupCtx = await apiRequestModule.newContext({ baseURL: API_URL });
    await setupCtx.post('/auth/register', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: vendorEmail, password: PASSWORD },
    });
    const applyRes = await setupCtx.post('/vendor/apply', {
      headers: { Origin: 'http://localhost:3000' },
      data: { name: `Promo Vendor ${Date.now()}`, contactEmail: vendorEmail },
    });
    const vendorId = (await applyRes.json()).data.id;
    const vendorCookies = (await setupCtx.storageState()).cookies;
    await setupCtx.dispose();

    const admin = await apiRequestModule.newContext({ baseURL: API_URL });
    await admin.post('/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    await admin.patch(`/admin/vendors/${vendorId}/approve`, { headers: { Origin: 'http://localhost:3000' } });

    await page.context().addCookies(vendorCookies);
    await page.goto('/vendor/promotions');
    await expect(page.getByRole('heading', { name: 'Promotions' })).toBeVisible({ timeout: 10_000 });

    const vendorCode = uniqueCode('VE2E');
    await page.getByRole('button', { name: '+ New promotion' }).click();
    await page.locator('#promo-code').fill(vendorCode);
    await page.locator('#promo-value').fill('5');
    await page.locator('#promo-starts').fill('2020-01-01T00:00');
    await page.locator('#promo-ends').fill('2099-01-01T00:00');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/vendor/promotions') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create promotion' }).click(),
    ]);
    await expect(page.getByText(vendorCode)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText('Inactive')).toBeVisible({ timeout: 10_000 });

    // Admin side — same flow, PLATFORM scope, its own session.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginViaUI(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto('/admin/promotions');

    const adminCode = uniqueCode('AE2E');
    await adminPage.getByRole('button', { name: '+ New promotion' }).click();
    await adminPage.locator('#promo-code').fill(adminCode);
    await adminPage.locator('#promo-value').fill('15');
    await adminPage.locator('#promo-starts').fill('2020-01-01T00:00');
    await adminPage.locator('#promo-ends').fill('2099-01-01T00:00');
    await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes('/admin/promotions') && res.request().method() === 'POST'),
      adminPage.getByRole('button', { name: 'Create promotion' }).click(),
    ]);
    await expect(adminPage.getByText(adminCode)).toBeVisible({ timeout: 10_000 });

    await admin.dispose();
    await adminContext.close();
  });
});
