import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/** A seat can fold each toolbar down to its title, and finds it folded when it comes back. */
test.describe('folding the toolbars', () => {
  test('hides the tools when the player toolbar is folded, and keeps it folded after a reload', async ({ page }) => {
    await waitAppReady(page);
    const toolbar = page.locator('app-pl-toolbar');
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });

    await toolbar.getByTestId('pl-toolbar-fold').click();
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toHaveCount(0);
    await expect(toolbar).toContainText('PLツール');

    await page.reload();
    await waitAppReady(page);
    await expect(toolbar.getByTestId('pl-toolbar-fold')).toBeVisible({ timeout: 10000 });
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toHaveCount(0);

    await toolbar.getByTestId('pl-toolbar-fold').click();
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toBeVisible();
  });
});
