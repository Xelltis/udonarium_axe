import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('チャット設定パネル (chat-message-setting)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'チャット設定');
    await expect(page.locator('chat-message-setting')).toBeVisible({ timeout: 5000 });
  });

  test('立ち絵表示フラグ・高さ・ウィンドウ内表示の各設定が存在すること', async ({ page }) => {
    // checkbox/numberの各種設定がDOM上に出ている。
    await expect(page.locator('chat-message-setting input[name="portraitDisplayFlag"]').first()).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="portraitHeight"]')).toBeVisible();
    await expect(page.locator('chat-message-setting input[name="portraitInWindow"]')).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="isKeepPortraitOutWindow"]')).toBeAttached();
  });

  test('簡易表示フラグ・表示時間・UserID 関連の設定が存在すること', async ({ page }) => {
    await expect(page.locator('chat-message-setting input[name="chatSimpleDispFlag"]').first()).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="simpleDispFlagTime"]')).toBeAttached();
    await expect(page.locator('chat-message-setting input[name="simpleDispFlagUserId"]')).toBeAttached();
  });

  test('立ち絵高さの数値入力を編集できること', async ({ page }) => {
    const height = page.locator('chat-message-setting input[name="portraitHeight"]');
    await height.click();
    await height.press('Control+A');
    await height.fill('60');
    await expect(height).toHaveValue('60');
  });
});
