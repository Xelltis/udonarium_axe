import { expect, test } from '@playwright/test';

import { openPanel, openSaveLoad, waitAppReady } from './helpers';

test.describe('loading a ZIP', () => {
  test('opens a file picker and closes the small menu on "load ZIP" in save & load', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);
    await expect(page.locator('[data-testid="fab-zip-input"]')).toHaveAttribute(
      'accept',
      'application/xml,text/xml,application/zip'
    );

    const chooser = page.waitForEvent('filechooser');
    await menu.getByTestId('save-load-load').click();
    expect((await chooser).isMultiple()).toBe(true);
    await expect(menu).toBeHidden();
  });
});

test.describe('saving', () => {
  test('starts a download when the save button is clicked', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await menu.getByTestId('save-load-save').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});

test.describe('the keyboard on a panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test("shows where the keyboard is among the title bar's buttons, though they turn the browser's outline off", async ({
    page,
  }) => {
    await openPanel(page, 'カットイン');
    const minimize = page
      .locator('app-cut-in-list')
      .locator('xpath=ancestor::*[contains(@class, "draggable-panel")]')
      .getByRole('button', { name: '最小化' });
    await minimize.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(minimize).toBeFocused();
    await expect(minimize).toHaveCSS('outline-style', 'solid');
    await expect(minimize).toHaveCSS('outline-width', '2px');
  });
});
