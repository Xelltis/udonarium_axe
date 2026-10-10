import { expect, test } from '@playwright/test';

import { chatTabPill, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('チャット システムタブ', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('「現在: 」表示に固定のシステムタブ名が出ていること', async ({ page }) => {
    // 表示先は選べなくなり、専用の「システム」タブに固定されている。
    await expect(page.locator('app-chat-tab-setting').getByText('現在: システム')).toBeVisible();
  });

  test('システムタブは名前を変えられず、用途の説明が出ること', async ({ page }) => {
    await page.locator('app-chat-tab-setting li[role="option"]').filter({ hasText: 'システム' }).click();
    // 通常のタブと違い、名前は入力欄ではなく読み取り専用の表示になる。
    await expect(page.locator('app-chat-tab-setting input[name="tab-name"]')).toHaveCount(0);
    await expect(page.locator('app-chat-tab-setting').getByText(/知らせの貼り紙です/)).toBeVisible();
  });

  test('通常のタブは名前を編集できること', async ({ page }) => {
    await page.locator('app-chat-tab-setting li[role="option"]').filter({ hasText: 'サブタブ' }).click();
    const tabName = page.locator('app-chat-tab-setting input[name="tab-name"]');
    await expect(tabName).toHaveValue('サブタブ');
    await tabName.fill('打ち合わせ');
    await expect(chatTabPill(page, '打ち合わせ')).toBeVisible();
  });

  test('タブピル経由でチャットウィンドウ側のメインタブが選択状態であること (sanity)', async ({ page }) => {
    // 上記テストの前提として、チャットウィンドウのChatTabListが起動している。
    await expect(chatTabPill(page, 'メインタブ')).toBeVisible();
  });
});
