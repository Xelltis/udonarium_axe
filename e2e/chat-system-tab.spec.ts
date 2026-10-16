import { expect, test } from '@playwright/test';

import { chatTabPill, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('the system tab of the chat', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('shows the fixed system tab name in the "current:" line', async ({ page }) => {
    // Where it shows can no longer be chosen; it is fixed to the dedicated system tab.
    await expect(page.locator('app-chat-tab-setting').getByText('現在: システム')).toBeVisible();
  });

  test('does not let the system tab be renamed, and explains what it is for', async ({ page }) => {
    await page.locator('app-chat-tab-setting li[role="option"]').filter({ hasText: 'システム' }).click();
    // Unlike an ordinary tab's, its name is shown read-only rather than in an input.
    await expect(page.locator('app-chat-tab-setting input[name="tab-name"]')).toHaveCount(0);
    await expect(page.locator('app-chat-tab-setting').getByText(/知らせの貼り紙です/)).toBeVisible();
  });

  test('lets an ordinary tab be renamed', async ({ page }) => {
    await page.locator('app-chat-tab-setting li[role="option"]').filter({ hasText: 'サブタブ' }).click();
    const tabName = page.locator('app-chat-tab-setting input[name="tab-name"]');
    await expect(tabName).toHaveValue('サブタブ');
    await tabName.fill('打ち合わせ');
    await expect(chatTabPill(page, '打ち合わせ')).toBeVisible();
  });

  test('has the main tab of the chat window selected, seen through its pill (sanity)', async ({ page }) => {
    // As the premise of the tests above, the chat window's ChatTabList is up.
    await expect(chatTabPill(page, 'メインタブ')).toBeVisible();
  });
});
