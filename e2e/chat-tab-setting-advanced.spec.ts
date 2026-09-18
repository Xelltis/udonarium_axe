import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('チャットタブ設定 (詳細操作)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('上下移動ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('app-chat-tab-setting button[title="上に移動"]')).toBeVisible();
    await expect(page.locator('app-chat-tab-setting button[title="下に移動"]')).toBeVisible();
  });

  test('「削除を有効化」チェックボックス OFF のときタブ削除ボタンが disabled', async ({ page }) => {
    const allow = page.locator('app-chat-tab-setting input[name="allow-delete-tab"]');
    // 既定では unchecked。
    await expect(allow).not.toBeChecked();
    await expect(page.locator('app-chat-tab-setting').getByRole('button', { name: /タブ削除/ })).toBeDisabled();
  });

  test('「削除を有効化」を ON にするとタブ削除ボタンが活性化すること', async ({ page }) => {
    const allow = page.locator('app-chat-tab-setting input[name="allow-delete-tab"]');
    await allow.check();
    await expect(page.locator('app-chat-tab-setting').getByRole('button', { name: /タブ削除/ })).toBeEnabled();
  });

  test('タブ削除でチャットウィンドウのタブ数が減ること', async ({ page }) => {
    // 削除直後は objectDeleted$/objectChanged$ により selectedTab が
    // 残存タブに自動切替される (= 削除済みプロンプトはほとんど見えない)。
    // ここでは「タブ数が確実に減る」副作用で検証する。
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

  test('ログ保存ボタンが表示されること', async ({ page }) => {
    // 保存サブセクション内に「ログ保存」「全ログ保存」などのボタンがある。
    const panel = page.locator('app-chat-tab-setting');
    await expect(panel.getByRole('button', { name: '保存' })).toBeVisible();
  });
});
