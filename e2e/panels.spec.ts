import { expect, test } from '@playwright/test';

import { openFabMenu, openPanel, openSaveLoad, waitAppReady } from './helpers';

test.describe('左メニューからパネルを開く', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('テーブル設定パネルを開けること', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-table-setting button[title="新しいテーブルを作る"]')).toBeVisible();
  });

  test('画像管理パネルを開けること', async ({ page }) => {
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('file-storage').getByText('ここに画像をドロップ')).toBeVisible();
  });

  test('音楽パネル(Jukebox)を開けること', async ({ page }) => {
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('app-jukebox input[name="bgm-volume"]')).toBeVisible();
  });

  test('カットインパネルを開けること', async ({ page }) => {
    await openPanel(page, 'カットイン');
    await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  });

  test('ゲームリソースの小窓から手札を開け閉めでき、見学にはバフマネージャーと手札が出ないこと', async ({ page }) => {
    await openPanel(page, '手札');
    await expect(page.locator('app-hand-rail .hand-rail')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="fab-entry-gameResources"]').click();
    const resources = page.locator('[data-testid="fab-submenu-gameResources"]');
    await expect(resources.getByTestId('fab-entry-hand')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('app-pl-toolbar [title="手札を開閉"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const peerPanel = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await peerPanel.getByRole('button', { name: /^\s*見学\s*$/ }).click();
    await page.locator('[data-testid="fab-entry-gameResources"]').click();
    await expect(resources.getByTestId('fab-entry-inventory')).toBeVisible();
    await expect(resources.getByTestId('fab-entry-statusAilment')).toBeVisible();
    await expect(resources.getByTestId('fab-entry-buffManager')).toHaveCount(0);
    await expect(resources.getByTestId('fab-entry-hand')).toHaveCount(0);
  });

  test('ゲームリソースの小窓からダイス表設定を開けること', async ({ page }) => {
    await openPanel(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 10000 });
  });

  test('画像・ジュークボックス・カットイン・エフェクトは「メディア」の小窓にまとまり、選ぶと小窓が閉じること', async ({
    page,
  }) => {
    await openFabMenu(page);
    await expect(page.locator('[data-testid="fab-entry-jukebox"]')).toHaveCount(0);

    await page.locator('[data-testid="fab-entry-media"]').click();
    const media = page.locator('[data-testid="fab-submenu-media"]');
    await expect(media.locator('[data-label]')).toHaveCount(4);
    await expect(page.locator('[data-testid="fab-entry-media"]')).toHaveAttribute('aria-expanded', 'true');

    await media.getByTestId('fab-entry-jukebox').click();
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
    await expect(media).toBeHidden();
  });

  test('インベントリパネルを開けること', async ({ page }) => {
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
  });
});

test.describe('テーブル設定パネル', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toBeVisible({ timeout: 10000 });
  });

  test('テーブル名を変更できること', async ({ page }) => {
    const nameInput = page.locator('game-table-setting input[placeholder="テーブル名を入力"]');
    await nameInput.fill('テスト卓');
    await expect(nameInput).toHaveValue('テスト卓');
  });

  test('グリッド種類を変更できること', async ({ page }) => {
    const gridSelect = page.locator('select[name="tableGridType"]');
    await expect(gridSelect).toBeVisible();
    await gridSelect.selectOption('0');
    await expect(gridSelect).toHaveValue('0');
    await gridSelect.selectOption('1');
    await expect(gridSelect).toHaveValue('1');
  });

  test('テーブル幅のスライダーが存在すること', async ({ page }) => {
    await expect(page.locator('input[name="tableWidth"][type="range"]')).toBeVisible();
  });

  test('テーブル高さのスライダーが存在すること', async ({ page }) => {
    await expect(page.locator('input[name="table-height-range"][type="range"]')).toBeVisible();
  });

  test('グリッド常時表示チェックボックスが存在すること', async ({ page }) => {
    await expect(page.locator('input[name="tableGridShow"]')).toBeVisible();
  });

  test('スナップ設定セレクトが存在すること', async ({ page }) => {
    await expect(page.locator('select[name="tableSnapMode"]')).toBeVisible();
  });

  test('背景フィルタを変更できること', async ({ page }) => {
    const filterSelect = page.locator('select[name="tableDistanceviewFilter"]');
    await expect(filterSelect).toBeVisible();
    await filterSelect.selectOption('white');
    await expect(filterSelect).toHaveValue('white');
  });

  test('新しいテーブルを作成できること', async ({ page }) => {
    const items = page.locator('game-table-setting li[role="option"]');
    const initialCount = await items.count();
    await page.locator('game-table-setting button[title="新しいテーブルを作る"]').click();
    await expect(items).toHaveCount(initialCount + 1, { timeout: 5000 });
  });

  test('保存ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('game-table-setting').getByRole('button', { name: '保存' })).toBeVisible();
  });
});

test.describe('画像管理パネル', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
  });

  test('ドロップゾーンが表示されること', async ({ page }) => {
    const storage = page.locator('file-storage');
    await expect(storage.getByText('ここに画像をドロップ')).toBeVisible();
    await expect(storage.getByText('またはここをクリックして選択')).toBeVisible();
  });

  test('ファイル入力が存在すること', async ({ page }) => {
    const fileInput = page.locator('file-storage input[type="file"][accept="image/*"]');
    await expect(fileInput).toBeAttached();
  });

  test('タグ変更ボタンと入力欄が存在すること', async ({ page }) => {
    await expect(page.locator('file-storage').getByRole('button', { name: /タグを変更/ })).toBeVisible();
    await expect(page.locator('file-storage input[placeholder="新タグ名"]')).toBeVisible();
  });

  test('タグのラジオボタンが存在すること', async ({ page }) => {
    // 「全て / 未設定」など複数のシステムタグが既定で存在する。
    // ラジオ自体は class="peer hidden" で display:none。
    await expect(page.locator('file-storage input[name="image-chg"]').first()).toBeAttached();
  });
});

test.describe('音楽パネル(Jukebox)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  });

  test('音量スライダー4種が表示されること', async ({ page }) => {
    const j = page.locator('app-jukebox');
    await expect(j.locator('input[name="audition-volume"]')).toBeVisible();
    await expect(j.locator('input[name="bgm-volume"]')).toBeVisible();
    await expect(j.locator('input[name="se-volume"]')).toBeVisible();
    await expect(j.locator('input[name="room-volume"]')).toBeAttached();
  });

  test('ライブラリ/再生リスト 切替タブが存在すること', async ({ page }) => {
    const j = page.locator('app-jukebox');
    await expect(j.getByRole('button', { name: /ライブラリ/ })).toBeVisible();
    await expect(j.getByRole('button', { name: /再生リスト/ })).toBeVisible();
  });

  test('音楽ドロップゾーンが表示されること', async ({ page }) => {
    await expect(page.locator('app-jukebox').getByText('ここに音楽をドロップ')).toBeVisible();
  });

  test('音楽ファイル入力が存在すること', async ({ page }) => {
    const fileInput = page.locator('app-jukebox input[type="file"][accept="audio/*"]');
    await expect(fileInput).toBeAttached();
  });

  test('全体音量の変更有効化チェックボックスが存在すること', async ({ page }) => {
    const checkbox = page.locator('app-jukebox input[name="room-volume-change"]');
    await expect(checkbox).toBeVisible();
  });
});

test.describe('パネル操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('複数パネルを同時に開けること', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting').first()).toBeVisible({ timeout: 10000 });
    await openPanel(page, '画像');
    // 両方のパネルが同時に存在する
    await expect(page.locator('game-table-setting')).toHaveCount(1);
    await expect(page.locator('file-storage')).toHaveCount(1);
  });

  test('同じパネルを複数回開けること', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting').first()).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toHaveCount(2, { timeout: 5000 });
  });
});

test.describe('ZIP読込', () => {
  test('セーブ&ロードの「ZIP読込」を押すとファイル選択が開き、小窓は閉じること', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);
    await expect(page.locator('[data-testid="fab-zip-input"]')).toHaveAttribute(
      'accept',
      'application/xml,text/xml,application/zip'
    );

    const chooser = page.waitForEvent('filechooser');
    await menu.getByTestId('save-load-load').click();
    expect((await chooser).isMultiple()).toBe(true);
    await expect(menu).toBeHidden();
  });
});

test.describe('キャラ取り込み (FAB のセーブ&ロード)', () => {
  test('セーブ&ロードの「キャラ取り込み」から取り込みパネルが開き、小窓は閉じること', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);

    await menu.getByTestId('save-load-import-character').click();

    await expect(page.locator('import-character')).toBeVisible({ timeout: 5000 });
    await expect(menu).toBeHidden();
  });

  test('見学には読込とキャラ取り込みを押させないこと', async ({ page }) => {
    await waitAppReady(page);
    const peerPanel = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await peerPanel.getByRole('button', { name: /^\s*見学\s*$/ }).click();

    const menu = await openSaveLoad(page);
    await expect(menu.getByTestId('save-load-load')).toBeDisabled();
    await expect(menu.getByTestId('save-load-import-character')).toBeDisabled();
    await expect(menu.getByTestId('save-load-save')).toBeEnabled();
  });
});

test.describe('保存機能', () => {
  test('保存ボタンをクリックするとダウンロードが開始されること', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await menu.getByTestId('save-load-save').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});
