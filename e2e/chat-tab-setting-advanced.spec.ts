import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('chat tab settings (further operations)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('has the move up and move down buttons', async ({ page }) => {
    await expect(page.locator('app-chat-tab-setting button[title="上に移動"]')).toBeVisible();
    await expect(page.locator('app-chat-tab-setting button[title="下に移動"]')).toBeVisible();
  });

  test('disables the delete tab button while "allow deleting" is unchecked', async ({ page }) => {
    const allow = page.locator('app-chat-tab-setting input[name="allow-delete-tab"]');
    // Unchecked by default.
    await expect(allow).not.toBeChecked();
    await expect(page.locator('app-chat-tab-setting').getByRole('button', { name: /タブ削除/ })).toBeDisabled();
  });

  test('enables the delete tab button once "allow deleting" is checked', async ({ page }) => {
    const allow = page.locator('app-chat-tab-setting input[name="allow-delete-tab"]');
    await allow.check();
    await expect(page.locator('app-chat-tab-setting').getByRole('button', { name: /タブ削除/ })).toBeEnabled();
  });

  test('leaves the chat window with fewer tabs after a tab is deleted', async ({ page }) => {
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
  });

  test('shows the save log button', async ({ page }) => {
    // The save part holds buttons such as the ones that save the log and every log.
    const panel = page.locator('app-chat-tab-setting');
    await expect(panel.getByRole('button', { name: '保存' })).toBeVisible();
  });
});
