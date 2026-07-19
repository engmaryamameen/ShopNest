import { test, expect } from '@playwright/test';

/**
 * E2E auth flows — run against a live dev environment.
 * Set WEB_URL and API_URL in playwright.config.ts baseURL.
 */

const TEST_EMAIL = `e2e-${Date.now()}@shopnest.test`;
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Authentication', () => {
  test('register → login → logout flow', async ({ page }) => {
    // Register
    await page.goto('/register');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to /shop after registration
    await expect(page).toHaveURL(/\/shop/);

    // Logout
    await page.click('text=Logout');
    await expect(page).toHaveURL(/\/login/);

    // Login
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/shop/);
  });

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Forders/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'nonexistent@example.com');
    await page.fill('#password', 'wrongpassword123');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('returnTo redirect works after login', async ({ page }) => {
    // Try to access protected page → redirect with returnTo
    await page.goto('/orders');
    const loginUrl = page.url();
    expect(loginUrl).toContain('returnTo=%2Forders');

    // Login
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should return to /orders
    await expect(page).toHaveURL(/\/orders/);
  });
});

test.describe('Shop catalog', () => {
  test('shop page loads without auth', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/shop/);
    // Page should not redirect to login
    expect(page.url()).not.toContain('/login');
  });
});
