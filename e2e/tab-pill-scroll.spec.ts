import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('scroll arrows on the chat tab pills', () => {
  test('shows no scroll arrows by default (two tabs)', async ({ page }) => {
    await waitAppReady(page);
    // By default there are two tabs, main and sub, and canScrollLeft/Right are false.
    await expect(page.locator('chat-window button[title="左にスクロール"]')).toHaveCount(0);
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toHaveCount(0);
  });

  test('overflows the pills and shows the right scroll arrow once many tabs are added', async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    // Press "add tab" ten times for more tabs.
    for (let i = 0; i < 10; i++) {
      await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    }
    // The tab pill container in chat-window overflows and the right arrow shows.
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows the left scroll arrow when the tab pill container is scrolled directly', async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    for (let i = 0; i < 10; i++) {
      await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    }
    await expect(page.locator('chat-window button[title="右にスクロール"]')).toBeVisible({ timeout: 5000 });
    // The chat-tab-setting panel covers it and a click would not reach, so the container's scrollLeft is
    // written directly. The (scroll) event then sets canScrollLeft to true.
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
