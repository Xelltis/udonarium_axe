import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

test.describe('the cut-in list', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'カットイン');
    await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  });

  test('lists the samples at first and asks for one to be chosen', async ({ page }) => {
    // The default room holds sample cut-ins, so a list shows instead of an empty view.
    await expect(page.locator('app-cut-in-list li[role="option"]').first()).toBeVisible();
    await expect(page.locator('app-cut-in-list').getByText('左のリストから選択してください')).toBeVisible();
  });

  test('opens the editor when one is chosen from the list', async ({ page }) => {
    await page.locator('app-cut-in-list li[role="option"]').first().click();

    await expect(page.locator('app-cut-in-list cut-in-editor')).toBeVisible({ timeout: 5000 });
    // The save and delete buttons appear in the footer.
    await expect(page.locator('app-cut-in-list').getByRole('button', { name: /保存/ })).toBeVisible();
    await expect(page.locator('app-cut-in-list').getByRole('button', { name: /削除/ })).toBeVisible();
  });

  test('adds a cut-in to the list with the add button (+)', async ({ page }) => {
    const itemsBefore = await page.locator('app-cut-in-list li[role="option"]').count();
    await page.locator('app-cut-in-list button[title="新しいカットインを作る"]').click();
    await expect(page.locator('app-cut-in-list li[role="option"]')).toHaveCount(itemsBefore + 1, {
      timeout: 5000,
    });
  });
});
