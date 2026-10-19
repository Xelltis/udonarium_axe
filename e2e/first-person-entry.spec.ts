import { expect, Locator, Page, test } from '@playwright/test';

import { closeFabMenu, openFabMenu, waitAppReady } from './helpers';

/** Opens the Table group from the top-left menu and returns the Dungeondry Master mode entry in it. */
async function firstPersonEntry(page: Page): Promise<Locator> {
  await openFabMenu(page);
  const submenu = page.getByTestId('fab-submenu-table');
  if (!(await submenu.isVisible())) await page.getByTestId('fab-entry-table').click();
  await expect(submenu).toBeVisible();
  return page.getByTestId('fab-entry-firstPersonView');
}

test.describe('Dungeondry Master mode from the Table group', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('enters Dungeondry Master mode on a chosen piece, and goes back to the table from the same entry', async ({
    page,
  }) => {
    const entry = await firstPersonEntry(page);
    await expect(entry).toBeVisible();
    await entry.click();

    const chooser = page.locator('context-menu').last();
    await expect(chooser.locator('li').first()).toBeVisible({ timeout: 5000 });
    await chooser.locator('li').first().click();
    await expect(page.locator('first-person-view')).toBeAttached({ timeout: 10000 });

    const leave = await firstPersonEntry(page);
    await expect(leave).toHaveAttribute('aria-label', /ダンジョンドリィマスターモードをやめる/);
    await leave.click();
    await closeFabMenu(page);
    await expect(page.locator('first-person-view')).toHaveCount(0, { timeout: 10000 });
  });
});
