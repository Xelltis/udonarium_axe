import { expect, Page, test } from '@playwright/test';

import { openChatSettingsMenuItem, openPanel, waitAppReady } from './helpers';

/**
 * What is deleted once the question has been answered goes from the list it was picked in, rather
 * than staying drawn there until the list is next touched.
 */
test.describe('deleting after the question', () => {
  async function becomeGm(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
  }

  async function answerDelete(page: Page) {
    await page.locator('confirm-dialog').getByRole('button', { name: '削除' }).click();
  }

  test('takes a cut-in off the list once it is deleted', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, 'カットイン');
    const list = page.locator('app-cut-in-list');
    const entries = list.locator('ul[role="listbox"] > li[role="option"]');
    await expect(entries.first()).toBeVisible({ timeout: 5000 });
    const before = await entries.count();

    await list.locator('button[title="新しいカットインを作る"]').first().click();
    await expect(entries).toHaveCount(before + 1);
    await list.locator('button', { hasText: '削除' }).click();
    await answerDelete(page);

    await expect(entries).toHaveCount(before);
  });

  test('takes a dice table off the list once it is deleted', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    const panel = page.locator('dice-table-setting');
    await expect(panel).toBeVisible({ timeout: 5000 });
    const entries = panel.locator('ul[role="listbox"] > li[role="option"]');
    const before = await entries.count();

    await panel.locator('button[title="新しい表を作る"]').first().click();
    await expect(entries).toHaveCount(before + 1);
    await panel.locator('button', { hasText: '削除' }).click();
    await answerDelete(page);

    await expect(entries).toHaveCount(before);
  });
});
