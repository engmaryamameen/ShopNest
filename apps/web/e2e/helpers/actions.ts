import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Registers via the real form and waits for the register call to actually
 * resolve before returning — `page.click()` only waits for the click event
 * itself, not for the async request/redirect it triggers, so a caller that
 * navigates immediately afterward (e.g. straight to a protected page) can
 * easily race the cookie actually being set. Works for both the happy path
 * (redirect follows) and a validation failure (no redirect, error shown). */
export async function registerViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirm', password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/register') && res.request().method() === 'POST'),
    page.click('button[type="submit"]'),
  ]);
}

/** Same race-condition fix as {@link registerViaUI}, for login. Does *not*
 * navigate to a bare `/login` if the page is already sitting on some
 * `/login?...` URL — a caller that got there via a protected-route redirect
 * (carrying `?returnTo=...`) needs that query string preserved, not
 * clobbered by a fresh navigation. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  if (!page.url().includes('/login')) {
    await page.goto('/login');
  }
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/login') && res.request().method() === 'POST'),
    page.click('button[type="submit"]'),
  ]);
}

/** Accepts the next `window.confirm()` dialog — several account-management
 * buttons (revoke session, suspend/reactivate user, cancel order) use the
 * native `confirm()` for a lightweight "are you sure" prompt. */
export function acceptNextConfirm(page: Page): void {
  page.once('dialog', (dialog) => dialog.accept());
}

/** Opens the desktop account dropdown (the "Welcome back / {email}" trigger
 * in the header) — used by the desktop journey only; the mobile spec drives
 * its own hamburger drawer instead rather than assuming this trigger's text
 * is present at a narrow viewport.
 *
 * Scoped to `header` and to a `button` role specifically — the same
 * "Welcome back" copy also appears as static (non-interactive) text inside
 * the mobile drawer's account panel, which stays present in the DOM (off
 * canvas, not unmounted) even at a desktop viewport, so an unscoped text
 * locator matches both and Playwright correctly refuses to guess which one. */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.locator('header').getByRole('button', { name: /Welcome back/ }).click();
}

export async function expectRedirectedToLogin(page: Page, returnTo?: string): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
  if (returnTo) {
    expect(page.url()).toContain(`returnTo=${encodeURIComponent(returnTo)}`);
  }
}
