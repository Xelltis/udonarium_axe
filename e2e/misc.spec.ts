import { expect, test } from '@playwright/test';

import { openFabMenu, openPanel, waitAppReady } from './helpers';

test.describe('more on image storage (file-storage)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
  });

  test('takes text in the new tag name field', async ({ page }) => {
    const input = page.locator('file-storage input[placeholder="新タグ名"]');
    await input.fill('テスト用');
    await expect(input).toHaveValue('テスト用');
  });

  test('limits the new tag name with maxlength=12', async ({ page }) => {
    const input = page.locator('file-storage input[placeholder="新タグ名"]');
    await expect(input).toHaveAttribute('maxlength', '12');
  });
});

test.describe('Jukebox view modes', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  });

  test('shows how to add tracks on switching to the playlist tab', async ({ page }) => {
    await page
      .locator('app-jukebox')
      .getByRole('button', { name: /再生リスト/ })
      .click();
    await expect(page.locator('app-jukebox').getByText('再生リストにBGMを追加してください')).toBeVisible({
      timeout: 5000,
    });
  });

  test('shows the drop zone again on going back to the library tab', async ({ page }) => {
    await page
      .locator('app-jukebox')
      .getByRole('button', { name: /再生リスト/ })
      .click();
    await page
      .locator('app-jukebox')
      .getByRole('button', { name: /ライブラリ/ })
      .click();
    await expect(page.locator('app-jukebox').getByText('ここに音楽をドロップ')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('the way into each item of the left FAB menu', () => {
  test('gives every menu item but the theme button a data-label', async ({ page }) => {
    await waitAppReady(page);
    await openFabMenu(page);
    // Fixed labels by which each way in (a panel opening) can be checked.
    const expected = [
      '接続',
      'チャット',
      'テーブル関連',
      'メディア',
      'ゲームリソース',
      'セーブ&ロード',
      'ウィジェット',
      '表示',
    ];
    for (const label of expected) {
      await expect(page.locator(`[data-label="${label}"]`)).toBeVisible();
    }
  });
});

test.describe('chat panel: the back-scroll button', () => {
  test('shows no jump-to-latest button after some messages are sent (by default it is near the bottom)', async ({
    page,
  }) => {
    // chat-window does not show the expand_more button while isNearBottom(). Just after start-up, with few
    // messages, the button is not there at all (count=0).
    await waitAppReady(page);
    await expect(page.locator('chat-window button[title="最新メッセージへ移動"]')).toHaveCount(0);
  });
});

test.describe('the network indicator', () => {
  test('is in the DOM by default but carries the hidden class', async ({ page }) => {
    await waitAppReady(page);
    const indicator = page.locator('network-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toHaveClass(/hidden/);
  });
});
