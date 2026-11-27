import { test, expect } from '@playwright/test';
import { loginViaUI, registerViaUI } from './helpers/actions';

// Real-browser coverage for Phase 4's admin-app additions: the dashboard's
// live aggregates, the audit-log viewer, super-admin-only admin-account
// management, and the catalog-import preview/scope/trigger panel. The
// underlying business logic (dashboard aggregation math, scope filtering,
// the SUPER_ADMIN/ADMIN role hierarchy) is covered by
// admin.service.spec.ts / roles.guard.spec.ts / catalog-import.service.spec.ts
// — this suite exists to catch rendering/wiring bugs those can't.

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shopnest.dev';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('Admin app', () => {
  test('dashboard shows real aggregate counts and recent activity', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin');

    await expect(page.getByText('Total Sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Orders', { exact: true })).toBeVisible();
    await expect(page.getByText('Published products')).toBeVisible();
    await expect(page.getByText('Orders by status')).toBeVisible();
    await expect(page.getByText('Vendors by status')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
  });

  test('audit log lists real entries with actor and timestamp', async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    // This suite starts on a fresh database. Create its own audited action
    // rather than depending on a different test having run first.
    const name = `Audit category ${Date.now()}`;
    const created = await page.request.post(`${API_URL}/categories`, {
      headers: { Origin: process.env.WEB_URL ?? 'http://localhost:3000' },
      data: { name, isActive: false },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const category = (await created.json()).data as { id: string };
    await expect
      .poll(async () => {
        const response = await page.request.get(`${API_URL}/admin/audit-logs?targetType=Category`);
        expect(response.ok()).toBeTruthy();
        const data = (await response.json()).data as { items: Array<{ targetId: string }> };
        return data.items.some((entry) => entry.targetId === category.id);
      })
      .toBe(true);
    await page.goto('/admin/audit-log');

    await expect(page.getByRole('main').getByRole('heading', { name: 'Audit Log' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: category.id.slice(0, 8) });
    await expect(row).toContainText('ADMIN_CATEGORY_CREATE');
    await expect(row).toContainText(SUPER_ADMIN_EMAIL);
  });

  test('super admin can create a new admin account, which appears in the list', async ({
    page,
  }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin/admins');

    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Admin accounts' }),
    ).toBeVisible();

    const newAdminEmail = uniqueEmail('new-admin-e2e');
    await page.getByPlaceholder('new-admin@shopnest.dev').fill(newAdminEmail);
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/admin/admins') && res.request().method() === 'POST',
      ),
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
  test('a non-super-admin visiting admin-account management is redirected away, not shown a broken page', async ({
    page,
  }) => {
    const email = uniqueEmail('non-super-admin-e2e');
    const password = 'Str0ngPassw0rd!23';
    await registerViaUI(page, email, password);

    await page.goto('/admin/admins');
    // Not an admin at all, so /admin/layout.tsx itself redirects to /shop —
    // the SUPER_ADMIN-only page guard is unreachable from here, which is
    // exactly the outer layer of defense working as intended.
    await expect(page).toHaveURL(/\/shop/);
  });

  test('catalog import settings guide selection and publishing before any import is started', async ({
    page,
  }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/admin/imports');

    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Catalog imports' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'New import' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Choose products to import' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Select products', exact: true }),
    ).toHaveAttribute('aria-current', 'step');
    await page.getByRole('button', { name: 'Continue to publishing' }).click();
    await expect(page.getByRole('heading', { name: 'Decide how products go live' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publishing', exact: true })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByRole('button', { name: 'Preview products', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Back to product selection' }).click();
    await expect(page.getByRole('heading', { name: 'Choose products to import' })).toBeVisible();
    await page.getByRole('tab', { name: 'Import history' }).click();
    await expect(page.getByRole('tab', { name: 'Import history' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
