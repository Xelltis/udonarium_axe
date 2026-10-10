import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('チャットタブピルのスクロール矢印', () => {
  test('既定 (2 タブ) ではスクロール矢印は出ないこと', async ({ page }) => {
    await waitAppReady(page);
    // 既定はメインとサブの2タブで、canScrollLeft/Rightはfalse。
    await expect(page.locator('chat-window button[title="左にスクロール"]')).toHaveCount(0);
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toHaveCount(0);
  });

  test('タブを多数追加するとピルがオーバーフローして右スクロール矢印が現れること', async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    // 「タブを追加」を10回押してタブ数を増やす。
    for (let i = 0; i < 10; i++) {
      await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    }
    // chat-windowのタブpillコンテナがオーバーフローして右矢印が出る。
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toBeVisible({ timeout: 5000 });
  });

  test('タブピルコンテナを直接スクロールすると左スクロール矢印が現れること', async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    for (let i = 0; i < 10; i++) {
      await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    }
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toBeVisible({ timeout: 5000 });
    // chat-tab-settingパネルがかぶってクリックが届かないので、コンテナのscrollLeftを
    // 直接書き込む。すると(scroll)イベントでcanScrollLeftがtrueになる。
    await page.evaluate(() => {
      const el = document.querySelector('chat-window [class*="overflow-x-auto"]') as HTMLElement | null;
      if (el) {
        el.scrollLeft = el.scrollWidth - el.clientWidth;
        el.dispatchEvent(new Event('scroll'));
      }
    });
    await expect(page.locator('chat-window button[title="左にスクロール"]')).toBeVisible({ timeout: 5000 });
  });
});
