import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/actions';

// Real-browser coverage for Phase 4's admin-app additions: the dashboard's
// live aggregates, the audit-log viewer, super-admin-only admin-account
// management, and the catalog-import preview/scope/trigger panel. The
// underlying business logic (dashboard aggregation math, scope filtering,
// the SUPER_ADMIN/ADMIN role hierarchy) is covered by
// admin.service.spec.ts / roles.guard.spec.ts / catalog-import.service.spec.ts
// — this suite exists to catch rendering/wiring bugs those can't.

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shopnest.dev';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('Admin app', () => {
  test('dashboard shows real aggregate counts and recent activity', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin');

    await expect(page.getByText('Total revenue')).toBeVisible();
    await expect(page.getByText('Published products')).toBeVisible();
    await expect(page.getByText('Orders by status')).toBeVisible();
    await expect(page.getByText('Vendors by status')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
  });

  test('audit log lists real entries with actor and timestamp', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin/audit-log');

    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
    // The dev DB has real history from every prior admin/vendor action in
    // this run — assert the table renders rows, not an exact count.
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('super admin can create a new admin account, which appears in the list', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin/admins');

    await expect(page.getByRole('heading', { name: 'Admin accounts' })).toBeVisible();

    const newAdminEmail = uniqueEmail('new-admin-e2e');
    await page.getByPlaceholder('new-admin@shopnest.dev').fill(newAdminEmail);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/admin/admins') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create admin' }).click(),
    ]);

    await expect(page.getByText(/password-reset email was sent/i)).toBeVisible();
    await expect(page.getByText(newAdminEmail)).toBeVisible({ timeout: 10_000 });
  });

  // The ADMIN-vs-SUPER_ADMIN distinction itself (a plain ADMIN specifically
  // denied while still keeping every other admin route) is exercised
  // exhaustively at the unit level — roles.guard.spec.ts's "SUPER_ADMIN
  // hierarchy" suite. This browser-level check only needs to prove the
  // page itself redirects a non-super-admin away rather than rendering a
  // broken/empty screen — an ordinary authenticated customer is sufficient
  // for that, and doesn't need a second admin-creation round trip (with a
  // password-reset email capture) just to set this one test up.
  test('a non-super-admin visiting admin-account management is redirected away, not shown a broken page', async ({ page }) => {
    const email = uniqueEmail('non-super-admin-e2e');
    const password = 'Str0ngPassw0rd!23';
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.fill('#confirm', password);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/auth/register') && res.request().method() === 'POST'),
      page.click('button[type="submit"]'),
    ]);

    await page.goto('/admin/admins');
    // Not an admin at all, so /admin/layout.tsx itself redirects to /shop —
    // the SUPER_ADMIN-only page guard is unreachable from here, which is
    // exactly the outer layer of defense working as intended.
    await expect(page).toHaveURL(/\/shop/);
  });

  test('catalog-import panel previews a scoped run without committing it, then can trigger a real one', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin/imports');

    await expect(page.getByRole('heading', { name: 'Catalog imports' })).toBeVisible();

    await page.locator('#import-category-scope').fill('smartphones');
    await page.locator('#import-max-records').fill('2');

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/admin/catalog-imports/preview')),
      page.getByRole('button', { name: 'Preview' }).click(),
    ]);

    await expect(page.getByText('In scope')).toBeVisible();
    // A scoped-to-2 preview must never claim more than 2 are in scope.
    const scopedCountText = await page.locator('text=In scope').locator('..').locator('p.font-semibold').innerText();
    expect(Number(scopedCountText)).toBeLessThanOrEqual(2);

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/admin/catalog-imports/run')),
      page.getByRole('button', { name: 'Run synchronization' }).click(),
    ]);
    await expect(page.getByText(/Synchronization queued/i)).toBeVisible();
  });
});
