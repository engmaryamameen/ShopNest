import { test, expect } from '@playwright/test';
import { TEST_TOKEN_TTL_MS } from '../playwright.config';
import { waitForToken } from './helpers/mail-capture';
import { acceptNextConfirm, loginViaUI, openAccountMenu, registerViaUI } from './helpers/actions';

// Margin added on top of the API's configured token TTL before a test
// exercises the "expired" path — has to outlast the TTL, not just meet it.
const EXPIRED_TOKEN_WAIT_MS = TEST_TOKEN_TTL_MS + 1500;

/**
 * Phase 1 account-lifecycle journey, driven entirely through the real
 * Next.js UI in a real browser — register, verify, forgot/reset password,
 * sessions, logout, suspension, and the admin side of suspension. Complements
 * (does not replace) the API-level integration suite in apps/api/test —
 * this suite is about the UI actually wiring up to that API correctly:
 * redirects, loading/error/success states, and real user interactions.
 *
 * Requires ADMIN_EMAIL/ADMIN_PASSWORD (or their seed.ts defaults) to exist —
 * the CI e2e job runs `pnpm --filter @shopnest/api db:seed` before this suite.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@shopnest.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@ShopNest2025!';

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@shopnest.test`;
}

const PASSWORD = 'TestPassword123!';
const NEW_PASSWORD = 'NewTestPassword456!';

test.describe('Registration & email verification', () => {
  test('register lands on the returnTo target and shows an unverified state', async ({ page }) => {
    const email = uniqueEmail('verify');
    await registerViaUI(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/shop/);

    await page.goto('/account/security');
    await expect(page.getByText("isn't verified yet")).toBeVisible();
  });

  test('verifying via the emailed link clears the unverified banner', async ({ page }) => {
    const email = uniqueEmail('verify2');
    await registerViaUI(page, email, PASSWORD);

    const token = await waitForToken(email, 'Verify your ShopNest email');
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    await page.getByRole('link', { name: 'Continue to ShopNest' }).click();
    await expect(page).toHaveURL(/\/shop/);

    await page.goto('/account/security');
    await expect(page.getByText("isn't verified yet")).not.toBeVisible();
  });

  test('reusing the same verification link a second time is rejected (single-use)', async ({ page }) => {
    const email = uniqueEmail('verify3');
    await registerViaUI(page, email, PASSWORD);
    const token = await waitForToken(email, 'Verify your ShopNest email');

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: /isn.t valid/i })).toBeVisible();
  });

  test('an expired verification link shows the expired state', async ({ page }) => {
    // EMAIL_VERIFICATION_TOKEN_TTL_MS is configured short (TEST_TOKEN_TTL_MS,
    // playwright.config.ts) for this suite's API process specifically so
    // this journey can be driven through real elapsed time, not a DB backdoor.
    const email = uniqueEmail('verify-expired');
    await registerViaUI(page, email, PASSWORD);
    const token = await waitForToken(email, 'Verify your ShopNest email');

    await page.waitForTimeout(EXPIRED_TOKEN_WAIT_MS);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });

  test('resending verification shows a confirmation and a fresh link works', async ({ page }) => {
    const email = uniqueEmail('resend');
    await registerViaUI(page, email, PASSWORD);
    await page.goto('/account/security');

    await page.getByRole('button', { name: 'Resend email' }).click();
    await expect(page.getByText('Email sent')).toBeVisible();

    const token = await waitForToken(email, 'Verify your ShopNest email');
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  });
});

test.describe('Forgot / reset password', () => {
  test('forgot-password shows the same generic message regardless of outcome, and the reset link works', async ({ page }) => {
    const email = uniqueEmail('reset');
    await registerViaUI(page, email, PASSWORD);
    await page.context().clearCookies();

    await page.goto('/forgot-password');
    await page.fill('#email', email);
    await page.click('button[type="submit"]');
    await expect(page.getByText('a reset link is on its way')).toBeVisible();

    const token = await waitForToken(email, 'Reset your ShopNest password');
    await page.goto(`/reset-password?token=${token}`);
    await page.fill('#password', NEW_PASSWORD);
    await page.fill('#confirm', NEW_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login\?reset=success/);
    await expect(page.getByText('sign in with your new password')).toBeVisible();

    // Old password no longer works; new password does.
    await loginViaUI(page, email, PASSWORD);
    await expect(page.getByText('Invalid credentials')).toBeVisible();

    await loginViaUI(page, email, NEW_PASSWORD);
    // Login with no returnTo lands on / — the real homepage, not a
    // redirect stub — not /shop (validate-return-to.ts's fallback; register
    // special-cases this to /shop, login intentionally doesn't).
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  });

  test('an expired reset link is rejected with a clear error, not a silent failure', async ({ page }) => {
    const email = uniqueEmail('reset-expired');
    await registerViaUI(page, email, PASSWORD);
    await page.context().clearCookies();

    await page.goto('/forgot-password');
    await page.fill('#email', email);
    await page.click('button[type="submit"]');

    const token = await waitForToken(email, 'Reset your ShopNest password');
    await page.waitForTimeout(EXPIRED_TOKEN_WAIT_MS);

    await page.goto(`/reset-password?token=${token}`);
    await page.fill('#password', NEW_PASSWORD);
    await page.fill('#confirm', NEW_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('mismatched confirmation is caught client-side before any request is made', async ({ page }) => {
    await page.goto('/reset-password?token=irrelevant-for-this-check');
    await page.fill('#password', 'FirstPassword123!');
    await page.fill('#confirm', 'DifferentPassword456!');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});

test.describe('Sessions', () => {
  test('the current session appears in the list, and revoking it logs the device out', async ({ browser }) => {
    const email = uniqueEmail('sessions');
    const context = await browser.newContext();
    const page = await context.newPage();

    await registerViaUI(page, email, PASSWORD);
    await page.goto('/account/security');
    await expect(page.getByText('This device')).toBeVisible();

    const row = page.locator('div', { has: page.getByText('This device') }).first();
    acceptNextConfirm(page);
    await row.getByRole('button', { name: 'Revoke' }).click();

    // Revoking the current session logs this device out too.
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test('a second device shows up in the list and can be revoked independently of the first', async ({ browser }) => {
    const email = uniqueEmail('multisession');
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await registerViaUI(pageA, email, PASSWORD);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginViaUI(pageB, email, PASSWORD);
    await expect(pageB).toHaveURL(/^http:\/\/[^/]+\/$/); // login w/ no returnTo → / (see note above)

    await pageA.goto('/account/security');
    await pageA.reload();
    const otherDeviceRow = pageA.locator('div').filter({ hasText: 'Revoke' }).filter({ hasNotText: 'This device' }).first();
    await expect(otherDeviceRow).toBeVisible();

    acceptNextConfirm(pageA);
    await otherDeviceRow.getByRole('button', { name: 'Revoke' }).click();

    // Device B's session is now dead.
    await pageB.goto('/orders');
    await expect(pageB).toHaveURL(/\/login/);

    await contextA.close();
    await contextB.close();
  });
});

test.describe('Logout', () => {
  test('sign out via the account menu clears the session and redirects', async ({ page }) => {
    const email = uniqueEmail('logout');
    await registerViaUI(page, email, PASSWORD);

    await openAccountMenu(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/shop|\/$/);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Suspended account', () => {
  test('a suspended user is blocked from logging in with a clear message, and reactivation restores access', async ({ browser }) => {
    const email = uniqueEmail('suspend');
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await registerViaUI(userPage, email, PASSWORD);
    await userContext.close();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginViaUI(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto('/admin/users');

    const row = adminPage.locator('tr', { hasText: email });
    acceptNextConfirm(adminPage);
    await row.getByRole('button', { name: 'Suspend' }).click();
    await expect(row.getByText('SUSPENDED')).toBeVisible();

    // Suspended user can no longer log in.
    const retryContext = await browser.newContext();
    const retryPage = await retryContext.newPage();
    await loginViaUI(retryPage, email, PASSWORD);
    await expect(retryPage.getByText(/suspended/i)).toBeVisible();
    await retryContext.close();

    // Admin reactivates.
    acceptNextConfirm(adminPage);
    await row.getByRole('button', { name: 'Reactivate' }).click();
    await expect(row.getByText('ACTIVE')).toBeVisible();

    const finalContext = await browser.newContext();
    const finalPage = await finalContext.newPage();
    await loginViaUI(finalPage, email, PASSWORD);
    await expect(finalPage).toHaveURL(/^http:\/\/[^/]+\/$/); // login w/ no returnTo → / (see note above)
    await finalContext.close();

    await adminContext.close();
  });
});

test.describe('Admin authorization', () => {
  test('a non-admin visiting /admin/users is redirected away, not shown a broken/empty admin page', async ({ page }) => {
    const email = uniqueEmail('nonadmin');
    await registerViaUI(page, email, PASSWORD);

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/shop/);
  });

  test('an anonymous visitor hitting /admin/users is sent to login with a returnTo', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fusers/);
  });
});
