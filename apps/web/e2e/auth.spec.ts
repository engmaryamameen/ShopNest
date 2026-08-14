import { test, expect } from '@playwright/test';
import { openAccountMenu, loginViaUI, registerViaUI } from './helpers/actions';

/**
 * E2E auth flows — run against a live dev environment.
 * Set WEB_URL and API_URL in playwright.config.ts baseURL.
 */

const TEST_EMAIL = `e2e-${Date.now()}@shopnest.test`;
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Authentication', () => {
  test('register → login → logout flow', async ({ page }) => {
    // Register defaults an unqualified returnTo to /shop specifically
    // (register/page.tsx) — a deliberate asymmetry with login, which lands
    // on / (the homepage) instead. See the "returnTo redirect" test below
    // and account-lifecycle.spec.ts for the login-side behavior.
    await registerViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/shop/);

    // Logout — the account-menu trigger has to be opened first; the "Sign
    // out" button (this used to say "Logout" here, which doesn't match
    // account-content.tsx's actual label and, combined with never clicking
    // the trigger first, means this assertion was never actually exercised
    // — test:e2e wasn't wired into CI until Phase 0) lives inside the panel
    // it opens.
    await openAccountMenu(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/shop|\/$/);

    // Login with no returnTo lands on / (validate-return-to.ts's fallback),
    // which is the real homepage (a 200 render, not a redirect) — not /shop.
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  });

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Forders/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await loginViaUI(page, 'nonexistent@example.com', 'wrongpassword123');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('returnTo redirect works after login', async ({ page }) => {
    // Try to access protected page → redirect with returnTo
    await page.goto('/orders');
    const loginUrl = page.url();
    expect(loginUrl).toContain('returnTo=%2Forders');

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    // Should return to /orders
    await expect(page).toHaveURL(/\/orders/);
  });
});

test.describe('Shop catalog', () => {
  test('the homepage renders the real storefront (not a redirect to /shop)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Browse By Category' })).toBeVisible();
  });

  test('shop page loads without auth', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/shop/);
    // Page should not redirect to login
    expect(page.url()).not.toContain('/login');
  });

  test('product details load without auth', async ({ page }) => {
    await page.goto('/shop');
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();
    await expect(page).toHaveURL(/\/products\//);
    expect(page.url()).not.toContain('/login');
  });
});
