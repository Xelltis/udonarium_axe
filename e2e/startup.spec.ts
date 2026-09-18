import { expect, test } from '@playwright/test';

import { openFabMenu, waitAppReady } from './helpers';

test.describe('アプリケーション起動', () => {
  test('アプリが起動すること', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Udonarium/i);
  });

  test('ローディング後にメインUIが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-table-layer')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('game-table')).toBeAttached({ timeout: 20000 });
  });

  test('左 FAB メニューを開くと nav 項目が表示されること', async ({ page }) => {
    await waitAppReady(page);
    await openFabMenu(page);
    // ラベルは data-label 属性に入っており、テキストノードではない
    for (const label of [
      '接続',
      'チャット',
      'テーブル関連',
      'メディア',
      'ゲームリソース',
      'セーブ&ロード',
      'ウィジェット',
      '表示',
    ]) {
      await expect(page.locator(`[data-label="${label}"]`)).toBeVisible();
    }
  });
});

test.describe('初期パネル表示', () => {
  test('起動時に接続パネルとチャットパネルが自動で開くこと', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder="ニックネーム"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('接続パネル(PeerMenu)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder="ニックネーム"]')).toBeVisible({ timeout: 20000 });
  });

  test('ニックネームを変更できること', async ({ page }) => {
    const input = page.locator('input[placeholder="ニックネーム"]');
    await input.fill('テストプレイヤー');
    await expect(input).toHaveValue('テストプレイヤー');
  });

  test('ユーザーID欄が表示されること', async ({ page }) => {
    await expect(page.locator('peer-menu').getByText(/^ID[:：]/)).toBeVisible();
  });

  test('アイコン変更ボタン/画像のいずれかが表示されること', async ({ page }) => {
    // アイコン未設定なら button、設定済みなら同じタイトルの img が表示される
    await expect(
      page.locator('peer-menu').locator('[title="アイコンを変更する"], [aria-label="アイコンを変更する"]')
    ).toBeVisible();
  });

  test('通信タイムアウト設定を変更できること', async ({ page }) => {
    const timeoutInput = page.locator('input[name="peer-timeout"]');
    await expect(timeoutInput).toBeVisible();
    await timeoutInput.fill('30');
    await expect(timeoutInput).toHaveValue('30');
  });

  test('詳細表示チェックボックスが存在すること', async ({ page }) => {
    await expect(page.locator('input[name="disp-detail-flag"]')).toBeVisible();
  });

  test('ロビー表示ボタンが存在すること', async ({ page }) => {
    await expect(page.getByRole('button', { name: /ロビー/ })).toBeVisible();
  });
});

test.describe('ネットワークインジケーター', () => {
  test('ネットワークインジケーターが DOM に存在すること', async ({ page }) => {
    await page.goto('/');
    // 既定では非表示クラス (hidden) が付与されるので isAttached で確認する
    await expect(page.locator('network-indicator')).toBeAttached({ timeout: 20000 });
  });
});
