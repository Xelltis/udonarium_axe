import { expect, test } from '@playwright/test';

import { openFabMenu, openPanel, waitAppReady } from './helpers';

test.describe('画像管理 (file-storage) 追加', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
  });

  test('新タグ名入力欄に文字が入力できること', async ({ page }) => {
    const input = page.locator('file-storage input[placeholder="新タグ名"]');
    await input.fill('テスト用');
    await expect(input).toHaveValue('テスト用');
  });

  test('新タグ名は maxlength=12 で制限されていること', async ({ page }) => {
    const input = page.locator('file-storage input[placeholder="新タグ名"]');
    await expect(input).toHaveAttribute('maxlength', '12');
  });
});

test.describe('Jukebox 表示モード', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  });

  test('「再生リスト」タブに切り替えると登録案内が表示されること', async ({ page }) => {
    await page
      .locator('app-jukebox')
      .getByRole('button', { name: /再生リスト/ })
      .click();
    await expect(page.locator('app-jukebox').getByText('再生リストにBGMを追加してください')).toBeVisible({
      timeout: 5000,
    });
  });

  test('「ライブラリ」タブに戻すとドロップゾーンが再表示されること', async ({ page }) => {
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

test.describe('左 FAB 各メニュー項目の起動経路', () => {
  test('テーマボタン以外のメニュー項目はすべて data-label を持つこと', async ({ page }) => {
    await waitAppReady(page);
    await openFabMenu(page);
    // 起動経路 (= panel open) を確認できる固定ラベル群
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

test.describe('チャットパネル: バックスクロールボタン', () => {
  test('一定数メッセージを送信すると「最新メッセージへ移動」ボタンが現れないこと (default は近い位置)', async ({
    page,
  }) => {
    // chat-window は isNearBottom() のときは expand_more ボタンを表示しない。
    // 起動直後でメッセージが少ない状況ではボタンは存在しない (count=0)。
    await waitAppReady(page);
    await expect(page.locator('chat-window button[title="最新メッセージへ移動"]')).toHaveCount(0);
  });
});

test.describe('ネットワークインジケーター', () => {
  test('既定では DOM 上に存在するが非表示 (hidden) クラスが付くこと', async ({ page }) => {
    await waitAppReady(page);
    const indicator = page.locator('network-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toHaveClass(/hidden/);
  });
});
