import { expect, test } from '@playwright/test';

import { openFabMenu, openPanel, openSaveLoad, waitAppReady } from './helpers';

test.describe('opening panels from the left menu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the table settings panel', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-table-setting button[title="新しいテーブルを作る"]')).toBeVisible();
  });

  test('opens the image storage panel', async ({ page }) => {
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('file-storage').getByText('ここに画像をドロップ')).toBeVisible();
  });

  test('opens the music panel (Jukebox)', async ({ page }) => {
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('app-jukebox input[name="bgm-volume"]')).toBeVisible();
  });

  test('opens the cut-in panel', async ({ page }) => {
    await openPanel(page, 'カットイン');
    await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  });

  test('opens and closes the hand from the game resources small menu, and shows a guest neither the buff manager nor the hand', async ({
    page,
  }) => {
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

  test('opens the dice table settings from the game resources small menu', async ({ page }) => {
    await openPanel(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 10000 });
  });

  test('gathers images, the jukebox, cut-ins, effects and the battle stage in the media small menu, which closes once one is chosen', async ({
    page,
  }) => {
    await openFabMenu(page);
    await expect(page.locator('[data-testid="fab-entry-jukebox"]')).toHaveCount(0);

    await page.locator('[data-testid="fab-entry-media"]').click();
    const media = page.locator('[data-testid="fab-submenu-media"]');
    await expect(media.locator('[data-label]')).toHaveCount(5);
    await expect(media.getByTestId('fab-entry-battleCutIn')).toBeVisible();
    await expect(page.locator('[data-testid="fab-entry-media"]')).toHaveAttribute('aria-expanded', 'true');

    await media.getByTestId('fab-entry-jukebox').click();
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
    await expect(media).toBeHidden();
  });

  test('opens the inventory panel', async ({ page }) => {
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
  });
});

test.describe('the table settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toBeVisible({ timeout: 10000 });
  });

  test('changes the table name', async ({ page }) => {
    const nameInput = page.locator('game-table-setting input[placeholder="テーブル名を入力"]');
    await nameInput.fill('テスト卓');
    await expect(nameInput).toHaveValue('テスト卓');
  });

  test('changes the grid type', async ({ page }) => {
    const gridSelect = page.locator('select[name="tableGridType"]');
    await expect(gridSelect).toBeVisible();
    await gridSelect.selectOption('0');
    await expect(gridSelect).toHaveValue('0');
    await gridSelect.selectOption('1');
    await expect(gridSelect).toHaveValue('1');
  });

  test('has a table width slider', async ({ page }) => {
    await expect(page.locator('input[name="tableWidth"][type="range"]')).toBeVisible();
  });

  test('has a table height slider', async ({ page }) => {
    await expect(page.locator('input[name="table-height-range"][type="range"]')).toBeVisible();
  });

  test('has an always-show-grid checkbox', async ({ page }) => {
    await expect(page.locator('input[name="tableGridShow"]')).toBeVisible();
  });

  test('has a snap setting select', async ({ page }) => {
    await expect(page.locator('select[name="tableSnapMode"]')).toBeVisible();
  });

  test('changes the background filter', async ({ page }) => {
    const filterSelect = page.locator('select[name="tableDistanceviewFilter"]');
    await expect(filterSelect).toBeVisible();
    await filterSelect.selectOption('white');
    await expect(filterSelect).toHaveValue('white');
  });

  test('creates a new table', async ({ page }) => {
    const items = page.locator('game-table-setting li[role="option"]');
    const initialCount = await items.count();
    await page.locator('game-table-setting button[title="新しいテーブルを作る"]').click();
    await expect(items).toHaveCount(initialCount + 1, { timeout: 5000 });
  });

  test('has a save button', async ({ page }) => {
    await expect(page.locator('game-table-setting').getByRole('button', { name: '保存' })).toBeVisible();
  });
});

test.describe('the image storage panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
  });

  test('shows the drop zone', async ({ page }) => {
    const storage = page.locator('file-storage');
    await expect(storage.getByText('ここに画像をドロップ')).toBeVisible();
    await expect(storage.getByText('またはここをクリックして選択')).toBeVisible();
  });

  test('has a file input', async ({ page }) => {
    const fileInput = page.locator('file-storage input[type="file"][accept="image/*"]');
    await expect(fileInput).toBeAttached();
  });

  test('has a change-tag button and a field for it', async ({ page }) => {
    await expect(page.locator('file-storage').getByRole('button', { name: /タグを変更/ })).toBeVisible();
    await expect(page.locator('file-storage input[placeholder="新タグ名"]')).toBeVisible();
  });

  test('has tag radio buttons', async ({ page }) => {
    // Several system tags, such as all and untagged, are there by default.
    // The radios themselves are display:none through class="peer hidden".
    await expect(page.locator('file-storage input[name="image-chg"]').first()).toBeAttached();
  });
});

test.describe('the music panel (Jukebox)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  });

  test('shows the four volume sliders', async ({ page }) => {
    const j = page.locator('app-jukebox');
    await expect(j.locator('input[name="audition-volume"]')).toBeVisible();
    await expect(j.locator('input[name="bgm-volume"]')).toBeVisible();
    await expect(j.locator('input[name="se-volume"]')).toBeVisible();
    await expect(j.locator('input[name="room-volume"]')).toBeAttached();
  });

  test('has tabs to switch between the library and playlists', async ({ page }) => {
    const j = page.locator('app-jukebox');
    await expect(j.getByRole('button', { name: /ライブラリ/ })).toBeVisible();
    await expect(j.getByRole('button', { name: /再生リスト/ })).toBeVisible();
  });

  test('shows the music drop zone', async ({ page }) => {
    await expect(page.locator('app-jukebox').getByText('ここに音楽をドロップ')).toBeVisible();
  });

  test('has a music file input', async ({ page }) => {
    const fileInput = page.locator('app-jukebox input[type="file"][accept="audio/*"]');
    await expect(fileInput).toBeAttached();
  });

  test('lets only the GM move the room volumes (overall, BGM, SE and ambience)', async ({ page }) => {
    const names = ['room-volume', 'room-bgm-volume', 'room-se-volume', 'room-background-volume'];
    const sliders = names.map((name) => page.locator(`app-jukebox input[name="${name}"]`));
    for (const slider of sliders) await expect(slider).toBeDisabled();

    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();

    for (const slider of sliders) await expect(slider).toBeEnabled();
  });
});

test.describe('handling panels', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens several panels at once', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting').first()).toBeVisible({ timeout: 10000 });
    await openPanel(page, '画像');
    // Both panels are there at the same time.
    await expect(page.locator('game-table-setting')).toHaveCount(1);
    await expect(page.locator('file-storage')).toHaveCount(1);
  });

  test('opens the same panel more than once', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting').first()).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toHaveCount(2, { timeout: 5000 });
  });
});

test.describe('loading a ZIP', () => {
  test('opens a file picker and closes the small menu on "load ZIP" in save & load', async ({ page }) => {
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

test.describe('importing characters (save & load in the FAB)', () => {
  test('opens the import panel and closes the small menu on "import character" in save & load', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);

    await menu.getByTestId('save-load-import-character').click();

    await expect(page.locator('import-character')).toBeVisible({ timeout: 5000 });
    await expect(menu).toBeHidden();
  });

  test('shows a guest neither loading nor character import, and lets them only save', async ({ page }) => {
    await waitAppReady(page);
    const peerPanel = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await peerPanel.getByRole('button', { name: /^\s*見学\s*$/ }).click();

    const menu = await openSaveLoad(page);
    await expect(menu.getByTestId('save-load-save')).toBeEnabled();
    await expect(menu.getByTestId('save-load-load')).toHaveCount(0);
    await expect(menu.getByTestId('save-load-import-character')).toHaveCount(0);
  });
});

test.describe('saving', () => {
  test('starts a download when the save button is clicked', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openSaveLoad(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await menu.getByTestId('save-load-save').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});

test.describe('the keyboard on a panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test("shows where the keyboard is among the title bar's buttons, though they turn the browser's outline off", async ({
    page,
  }) => {
    await openPanel(page, 'カットイン');
    const minimize = page
      .locator('app-cut-in-list')
      .locator('xpath=ancestor::*[contains(@class, "draggable-panel")]')
      .getByRole('button', { name: '最小化' });
    await minimize.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(minimize).toBeFocused();
    await expect(minimize).toHaveCSS('outline-style', 'solid');
    await expect(minimize).toHaveCSS('outline-width', '2px');
  });
});
