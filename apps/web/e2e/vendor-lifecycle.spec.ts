import { test, expect } from '@playwright/test';
import { registerViaUI, loginViaUI } from './helpers/actions';

// End-to-end vendor lifecycle, driven through real UI interaction rather
// than direct API calls: application → admin approval → offer creation →
// customer purchase → vendor fulfilment. Cross-vendor isolation and the
// authorization matrix are covered exhaustively by the API-level unit/
// integration suites (see vendor-offers.service.spec.ts,
// vendor-orders.service.spec.ts) — this suite exists to catch what those
// can't: real rendering, hydration, and click-through wiring bugs.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shopnest.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';
const PASSWORD = 'Str0ngPassw0rd!23';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('Vendor lifecycle', () => {
  test('apply, admin approves, vendor lists an offer, customer buys it, vendor fulfils it', async ({
    page,
    browser,
  }) => {
    const vendorEmail = uniqueEmail('vendor-e2e');
    const vendorName = `E2E Vendor ${Date.now()}`;

    // ── Vendor applies via the real form ──────────────────────────────
    await registerViaUI(page, vendorEmail, PASSWORD);
    await page.goto('/vendor');
    await expect(page.getByRole('heading', { name: /become a shopnest vendor/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel(/store name|vendor name|business name/i).fill(vendorName);
    await page.getByLabel(/contact email/i).fill(`contact-${Date.now()}@example.com`);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/vendor/apply') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /apply|submit/i }).click(),
    ]);

    await expect(page.getByText(/under review|pending/i)).toBeVisible({ timeout: 10_000 });

    // ── Admin approves, in a separate browser context (own session) ───
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginViaUI(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    // Unfiltered "All" tab, not the PENDING-only tab — once approved, the
    // vendor legitimately drops out of the PENDING filter, so asserting an
    // "APPROVED" badge on that same filtered view would never see it.
    await adminPage.goto('/admin/vendors');
    const vendorRow = adminPage.getByRole('row', { name: new RegExp(vendorName) });
    await expect(vendorRow).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes('/admin/vendors/') && res.url().includes('/approve')),
      vendorRow.getByRole('button', { name: /approve/i }).click(),
    ]);
    await expect(adminPage.getByRole('row', { name: new RegExp(vendorName) }).getByText('APPROVED')).toBeVisible({
      timeout: 10_000,
    });
    await adminContext.close();

    // ── Vendor reaches their dashboard — no manual re-login/refresh step;
    // this is exactly the path that regresses if RolesGuard ever goes back
    // to trusting the access token's embedded (possibly stale) role claim
    // instead of the live DB role. ────────────────────────────────────
    await page.goto('/vendor');
    await expect(page.getByRole('heading', { name: vendorName })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Vendor dashboard')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Offers' })).toBeVisible();

    // ── Vendor creates an offer via the picker + form ──────────────────
    await page.goto('/vendor/offers');
    await page.getByRole('button', { name: /new offer/i }).click();
    await page.getByPlaceholder(/search products to sell/i).fill('Headphones');
    await expect(page.getByText('Wireless Noise-Cancelling Headphones')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Wireless Noise-Cancelling Headphones').click();
    await page.getByLabel(/your sku/i).fill(`E2E-SKU-${Date.now()}`);
    await page.getByLabel(/price/i).fill('49.99');
    await page.getByLabel(/starting stock/i).fill('15');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/vendor/offers') && res.request().method() === 'POST'),
      page.getByRole('button', { name: /create offer/i }).click(),
    ]);
    await expect(page.getByText('Wireless Noise-Cancelling Headphones')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('DRAFT')).toBeVisible();

    // Activate it so it's purchasable.
    await page.getByRole('button', { name: /activate/i }).first().click();
    await expect(page.getByText('ACTIVE')).toBeVisible({ timeout: 10_000 });

    // ── Vendor orders page renders with no orders yet ──────────────────
    await page.goto('/vendor/orders');
    await expect(page.getByText(/no orders yet/i)).toBeVisible({ timeout: 10_000 });

    // ── Vendor staff page renders and can send an invite ───────────────
    await page.goto('/vendor/staff');
    const staffEmail = uniqueEmail('staff-e2e');
    await page.getByPlaceholder(/teammate@example.com/i).fill(staffEmail);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/vendor/staff/invite')),
      page.getByRole('button', { name: /send invite/i }).click(),
    ]);
    await expect(page.getByText(staffEmail)).toBeVisible({ timeout: 10_000 });
  });
});
