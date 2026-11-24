import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { waitForSignupCode } from './mail-capture';

export async function startSignupViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register');
  await page.fill('#fullName', 'Alex Morgan');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirm', password);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/register') && res.request().method() === 'POST'),
    page.click('button[type="submit"]'),
  ]);
  expect(response.status(), `Registration failed: ${await response.text()}`).toBe(202);
  await expect(page.getByRole('heading', { name: 'Please verify your email address' })).toBeVisible();
}

export async function completeSignupViaUI(page: Page, email: string): Promise<void> {
  const code = await waitForSignupCode(email);
  for (let i = 0; i < code.length; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i]);
  }
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/signup/verify') && res.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create account' }).click(),
  ]);
  expect(response.ok(), `Verification failed: ${await response.text()}`).toBeTruthy();
  await expect(page).toHaveURL(/\/shop/);
}

export async function registerViaUI(page: Page, email: string, password: string): Promise<void> {
  await startSignupViaUI(page, email, password);
  await completeSignupViaUI(page, email);
}

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

export function acceptNextConfirm(page: Page): void {
  page.once('dialog', (dialog) => dialog.accept());
}

export async function openAccountMenu(page: Page): Promise<void> {
  await page.locator('header').getByRole('button', { name: /Welcome back/ }).click();
}

export async function expectRedirectedToLogin(page: Page, returnTo?: string): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
  if (returnTo) {
    expect(page.url()).toContain(`returnTo=${encodeURIComponent(returnTo)}`);
  }
}
