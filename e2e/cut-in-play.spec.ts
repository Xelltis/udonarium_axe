import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

async function openFirstCutIn(page: Page) {
  await waitAppReady(page);
  await openPanel(page, 'カットイン');
  await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  await page.locator('app-cut-in-list button[title="新しいカットインを作る"]').click();
  await expect(page.locator('app-cut-in-list cut-in-editor')).toBeVisible({ timeout: 5000 });
}

test.describe('playing a cut-in', () => {
  test.beforeEach(async ({ page }) => {
    await openFirstCutIn(page);
  });

  test('brings up cut-in-window from "play for everyone"', async ({ page }) => {
    await page.locator('cut-in-editor button[title="全員に再生"]').click();
    await expect(page.locator('app-cut-in-window')).toBeVisible({ timeout: 5000 });
  });
});
