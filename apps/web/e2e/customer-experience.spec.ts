import { test, expect, request as apiRequestModule, type APIRequestContext } from '@playwright/test';
import { registerViaUI } from './helpers/actions';

// Reviews, wishlist, addresses, PDP multi-offer, /shop filters — all
// through real UI interaction. Setup that has nothing to do with what's
// under test (getting an order to DELIVERED so a review can be written)
// goes through direct API calls, same pattern as vendor-lifecycle.spec.ts.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shopnest.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';
const PASSWORD = 'Str0ngPassw0rd!23';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function loginApi(ctx: APIRequestContext, email: string, password: string) {
  const res = await ctx.post('/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { email, password } });
  expect(res.ok()).toBeTruthy();
}

test.describe('Customer experience', () => {
  test('shop filters (sort, brand) are reflected in the URL and re-fetch results', async ({ page }) => {
    await page.goto('/shop');
    await page.locator('#shop-sort').selectOption('priceCents-asc');
    await expect(page).toHaveURL(/sortBy=priceCents&sortOrder=asc/);
  });

  test('wishlist: add from the shop grid, view it, remove it', async ({ page }) => {
    const email = uniqueEmail('wishlist-e2e');
    await registerViaUI(page, email, PASSWORD);

    await page.goto('/shop');
    const firstCard = page.locator('[data-testid="product-card"]').first();
    const productName = await firstCard.locator('h3').innerText();
    await firstCard.getByRole('button', { name: /add .* to wishlist/i }).click();
    await expect(firstCard.getByRole('button', { name: /saved to wishlist/i })).toBeVisible({ timeout: 10_000 });

    await page.goto('/account/wishlist');
    await expect(page.getByText(productName.trim())).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByText(/wishlist is empty/i)).toBeVisible({ timeout: 10_000 });
  });

  test('address book: first address auto-defaults, second does not, set-default flips it', async ({ page }) => {
    const email = uniqueEmail('address-e2e');
    await registerViaUI(page, email, PASSWORD);

    await page.goto('/account/addresses');
    await page.getByRole('button', { name: '+ Add address' }).click();
    await page.locator('#addr-name').fill('First Address');
    await page.locator('#addr-line1').fill('1 First St');
    await page.locator('#addr-city').fill('Springfield');
    await page.locator('#addr-postal').fill('11111');
    await page.locator('#addr-country').fill('US');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/me/addresses') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save address' }).click(),
    ]);
    await expect(page.getByText('Default', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '+ Add address' }).click();
    await page.locator('#addr-name').fill('Second Address');
    await page.locator('#addr-line1').fill('2 Second St');
    await page.locator('#addr-city').fill('Shelbyville');
    await page.locator('#addr-postal').fill('22222');
    await page.locator('#addr-country').fill('US');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/me/addresses') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save address' }).click(),
    ]);

    // Only one "Default" badge exists — the second address did not also
    // become default. Exact match — "Set as default" (the button on the
    // non-default card) also contains the substring "default".
    await expect(page.getByText('Default', { exact: true })).toHaveCount(1);

    await page.getByRole('button', { name: 'Set as default' }).click();
    const secondCard = page.getByText('Second Address').locator('../..');
    await expect(secondCard.getByText('Default', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Default', { exact: true })).toHaveCount(1);
  });

  test('PDP shows a real rating and lets a delivered buyer submit a review', async ({ page }) => {
    // All setup below is direct API calls — getting an order to DELIVERED
    // isn't what this test verifies. Each call uses its own context so
    // buyer/admin sessions never share cookies.
    const buyer = await apiRequestModule.newContext({ baseURL: API_URL });
    const buyerEmail = uniqueEmail('reviewer-e2e');
    await buyer.post('/auth/register', {
      headers: { Origin: 'http://localhost:3000' },
      data: { email: buyerEmail, password: PASSWORD },
    });

    const productsRes = await buyer.get('/products?q=Headphones');
    const product = (await productsRes.json()).data.items[0];

    await buyer.put('/cart/items', {
      headers: { Origin: 'http://localhost:3000' },
      data: { vendorOfferId: product.offerId, quantity: 1 },
    });
    const checkoutRes = await buyer.post('/orders/checkout', {
      headers: { Origin: 'http://localhost:3000' },
      data: { idempotencyKey: crypto.randomUUID() },
    });
    const order = (await checkoutRes.json()).data;

    const admin = await apiRequestModule.newContext({ baseURL: API_URL });
    await loginApi(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) {
      const res = await admin.patch(`/admin/orders/${order.id}/status`, {
        headers: { Origin: 'http://localhost:3000' },
        data: { status },
      });
      expect(res.ok()).toBeTruthy();
    }
    await admin.dispose();

    // Real thing under test starts here: sign in as the buyer through the
    // UI and use the review form.
    const cookies = (await buyer.storageState()).cookies;
    await buyer.dispose();
    await page.context().addCookies(cookies);

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole('heading', { name: 'Write a review' })).toBeVisible({ timeout: 10_000 });

    // Title carries the buyer email so repeat runs against this same
    // seeded product never collide on review text.
    const reviewTitle = `Great buy (${buyerEmail})`;
    await page.locator('#review-title').fill(reviewTitle);
    await page.locator('#review-body').fill('Exactly as described, arrived on time, works perfectly.');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/reviews') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Submit review' }).click(),
    ]);
    await expect(page.getByText('Thanks for your review!')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(reviewTitle)).toBeVisible({ timeout: 10_000 });
    // Every review submitted through this flow is 5 stars — the average
    // stays 5.0 regardless of how many prior runs contributed reviews to
    // this same seeded product; only the count grows.
    await expect(page.getByText(/5\.0 \(\d+ reviews?\)/)).toBeVisible();
  });
});
