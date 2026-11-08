import { expect, test } from '@playwright/test';

import { chatTabPill, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('chat tab settings (further operations)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('renames an ordinary tab, and leaves the chat window with fewer tabs once it is deleted', async ({ page }) => {
    await page.locator('app-chat-tab-setting li[role="option"]').filter({ hasText: 'サブタブ' }).click();
    const tabName = page.locator('app-chat-tab-setting input[name="tab-name"]');
    await expect(tabName).toHaveValue('サブタブ');
    await tabName.fill('打ち合わせ');
    await expect(chatTabPill(page, '打ち合わせ')).toBeVisible();

    // Right after the delete, objectDeleted$/objectChanged$ switch selectedTab to a remaining tab
    // on their own, so the prompt for a deleted tab is hardly ever seen. The check here goes by the
    // side effect that the number of tabs surely drops.
    const before = await page.locator('chat-window input[name^="chat-tab"]').count();
    await page.locator('app-chat-tab-setting input[name="allow-delete-tab"]').check();
    await page
      .locator('app-chat-tab-setting')
      .getByRole('button', { name: /タブ削除/ })
      .click();
    await expect
      .poll(() => page.locator('chat-window input[name^="chat-tab"]').count(), { timeout: 5000 })
      .toBeLessThan(before);
    await expect(chatTabPill(page, '打ち合わせ')).toHaveCount(0);
  });
});
