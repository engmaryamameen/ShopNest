import { expect, type Page } from '@playwright/test';

/** Exercise the shared date dialog instead of filling removed native inputs. */
async function chooseToday(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: label });
  const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(),
  );
  await dialog.getByRole('button', { name: today, exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

export async function createPromotionViaUI(
  page: Page,
  scope: 'admin' | 'vendor',
  code: string,
  value: string,
) {
  await page.getByRole('button', { name: 'New promotion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Promotion code', exact: true }).fill(code);
  await page.getByRole('spinbutton', { name: 'Promotion value', exact: true }).fill(value);
  await chooseToday(page, 'Promotion starts');
  await chooseToday(page, 'Promotion ends');
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes(`/${scope}/promotions`) && res.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Create promotion', exact: true }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toBeVisible();
  return row;
}

export async function deactivatePromotionViaUI(page: Page, code: string) {
  const row = page.getByRole('row').filter({ hasText: code });
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/promotions/') && res.request().method() === 'PATCH',
    ),
    row.getByRole('button', { name: 'Deactivate', exact: true }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(row.getByText('Inactive', { exact: true })).toBeVisible();
}
