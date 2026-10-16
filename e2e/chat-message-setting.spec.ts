import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('the chat settings panel (chat-message-setting)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'チャット設定');
    await expect(page.locator('chat-message-setting')).toBeVisible({ timeout: 5000 });
  });

  test('has the settings for showing portraits, their height and showing them inside the window', async ({ page }) => {
    // The checkbox and number settings are in the DOM.
    await expect(page.locator('chat-message-setting input[name="portraitDisplayFlag"]').first()).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="portraitHeight"]')).toBeVisible();
    await expect(page.locator('chat-message-setting input[name="portraitInWindow"]')).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="isKeepPortraitOutWindow"]')).toBeAttached();
  });

  test('has the settings for the simple view, its time and the user ID', async ({ page }) => {
    await expect(page.locator('chat-message-setting input[name="chatSimpleDispFlag"]').first()).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="simpleDispFlagTime"]')).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="simpleDispFlagUserId"]')).toBeAttached();
  });

  test('edits the number for the portrait height', async ({ page }) => {
    const height = page.locator('chat-message-setting input[name="portraitHeight"]');
    await height.click();
    await height.press('Control+A');
    await height.fill('60');
    await expect(height).toHaveValue('60');
  });
});
