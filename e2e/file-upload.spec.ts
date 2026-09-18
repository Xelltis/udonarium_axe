import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * 1x1 PNG (transparent) — base64 から Buffer 化して setInputFiles に渡す。
 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * 最小限の MP3 ヘッダ (ID3v2 0 byte + dummy mp3 frame)。
 * デコードはされず、ImageStorage と同じく FileArchiver が中身を MIME で識別する。
 */
const TINY_MP3 = Buffer.from(
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'base64'
);

/**
 * 空の ZIP ファイル (PK\x05\x06 + 18 bytes of zeros = empty central directory)。
 * Udonarium の FileArchiver は壊れていても fail-soft なので、最低限フォーマット
 * として認識されれば OK。
 */
const EMPTY_ZIP = Buffer.from([
  0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00,
]);

async function openFileStorage(page: Page) {
  await waitAppReady(page);
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
}

async function openJukebox(page: Page) {
  await waitAppReady(page);
  await openPanel(page, 'ジュークボックス');
  await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
}

test.describe('画像アップロード (file-storage)', () => {
  test.beforeEach(async ({ page }) => {
    await openFileStorage(page);
  });

  test('PNG ファイルをアップロードすると画像グリッドに追加されること', async ({ page }) => {
    const beforeImageCount = await page.locator('file-storage img').count();
    await page.locator('file-storage input[type="file"][accept="image/*"]').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect
      .poll(() => page.locator('file-storage img').count(), { timeout: 10000 })
      .toBeGreaterThan(beforeImageCount);
  });

  test('アップロード後にタグラジオボタンの数 (image-chg) が維持または増加すること', async ({ page }) => {
    const before = await page.locator('file-storage input[name="image-chg"]').count();
    await page.locator('file-storage input[type="file"][accept="image/*"]').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect
      .poll(() => page.locator('file-storage input[name="image-chg"]').count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(before);
  });
});

test.describe('音楽アップロード (jukebox)', () => {
  test.beforeEach(async ({ page }) => {
    await openJukebox(page);
  });

  test('MP3 ファイルをアップロードするとライブラリにアイテムが追加されること', async ({ page }) => {
    // 既定では「この分類に音楽ファイルはありません」が出ているか、空。
    const items = page.locator('app-jukebox .text-ui-text.truncate');
    const before = await items.count();
    await page.locator('app-jukebox input[type="file"][accept="audio/*"]').setInputFiles({
      name: 'tiny.mp3',
      mimeType: 'audio/mpeg',
      buffer: TINY_MP3,
    });
    // ライブラリビューに新しい行 (オーディオ名 div) が現れる。
    await expect.poll(() => items.count(), { timeout: 15000 }).toBeGreaterThan(before);
  });
});

test.describe('ZIP / XML 読込 (FAB のセーブ&ロード)', () => {
  test('空 ZIP をセットしてもアプリがクラッシュしないこと', async ({ page }) => {
    await waitAppReady(page);
    const fileInput = page.locator('[data-testid="fab-zip-input"]');
    await fileInput.setInputFiles({
      name: 'empty.zip',
      mimeType: 'application/zip',
      buffer: EMPTY_ZIP,
    });
    // 読込が失敗してもチャット入力は生きているはず (アプリ生存確認)。
    await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 10000 });
  });
});
