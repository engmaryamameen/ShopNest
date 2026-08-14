import { test, expect } from '@playwright/test';
import { registerViaUI, loginViaUI } from './helpers/actions';

/**
 * Responsive-layout checks for the Phase 1 account journey — runs under the
 * `mobile-chromium` project (playwright.config.ts) at a real mobile
 * viewport/device profile. Focused on "does this actually work and look
 * right on a phone," not a full duplicate of the desktop functional suite
 * (account-lifecycle.spec.ts already covers the business logic once).
 */

function uniqueEmail(label: string): string {
  return `e2e-mobile-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@shopnest.test`;
}

const PASSWORD = 'TestPassword123!';

test.describe('Mobile — account journey', () => {
  test('register and login forms are usable with no horizontal overflow', async ({ page }) => {
    const email = uniqueEmail('form');

    await page.goto('/register');
    // No element should force the page wider than the viewport.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding

    await registerViaUI(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/shop/);
  });

  test('the security page and its buttons are reachable and tappable on a phone viewport', async ({ page }) => {
    const email = uniqueEmail('security');
    await registerViaUI(page, email, PASSWORD);

    await page.goto('/account/security');
    await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
    await expect(page.getByText("isn't verified yet")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend email' })).toBeVisible();

    await expect(page.getByText('This device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke' }).first()).toBeVisible();
  });

  test('login error state is legible on a phone viewport', async ({ page }) => {
    await loginViaUI(page, 'nobody@shopnest.test', 'wrongpassword123');
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});
