import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openInventory(page: Page) {
  await waitAppReady(page);
  await openPanel(page, 'インベントリ');
  await expect(page.locator('game-object-inventory')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
}

test.describe('インベントリパネル', () => {
  test.beforeEach(async ({ page }) => {
    await openInventory(page);
  });

  test('テーブル/共有/個人/墓場の4タブが表示されること', async ({ page }) => {
    const tabs = page.locator('game-object-inventory input[name="tab"]');
    await expect(tabs).toHaveCount(4);
  });

  test('タブを切り替えられること', async ({ page }) => {
    // ラジオは [&_input[type=radio]]:hidden で display:none、ラベル本体をクリックする。
    const labels = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
    const tabs = page.locator('game-object-inventory input[name="tab"]');
    await labels.nth(1).click();
    await expect(tabs.nth(1)).toBeChecked();
    await labels.nth(3).click();
    await expect(tabs.nth(3)).toBeChecked();
  });

  test('墓場タブで「墓場を空にする」ボタンが表示されること', async ({ page }) => {
    const graveyardLabel = page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(3);
    await graveyardLabel.click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /墓場を空にする/ })).toBeVisible();
  });

  test('表示設定ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('game-object-inventory button[title="表示設定"]')).toBeVisible();
  });

  test('一括移動ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('game-object-inventory button[title="一括移動"]')).toBeVisible();
  });

  test('表示設定画面を開いて並び順やタグ設定ができること', async ({ page }) => {
    // 並び順とタグの設定は自前のパネルに移っている。
    const settingsButton = page.locator('game-object-inventory button[title="表示設定"]');
    await settingsButton.click();
    const panel = page.locator('inventory-filter-panel');
    await expect(panel.locator('input[placeholder="タグ名"]').first()).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('select').first()).toBeVisible();
    // 卓上とインベントリの二枚ぶんの表示項目欄が並ぶ。書き方の例は増えていくので、文言ではなく欄の名前で探す。
    await expect(panel.locator('input[name="data-tag"]')).toBeVisible();
    await expect(panel.locator('input[name="table-data-tag"]')).toBeVisible();

    // 「表示設定」をもう一度押すとパネルが閉じる。
    await settingsButton.click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe('インベントリのコンテキストメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
  });

  test('インベントリのオブジェクトを右クリックするとコンテキストメニューが表示されること', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 3000 });
  });

  test('インベントリのコンテキストメニューに「詳細を表示」があること', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await expect(menu.getByText('詳細を表示')).toBeVisible();
  });

  test('インベントリの「詳細を表示」でシートが開くこと', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await menu.getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 5000 });
  });

  test('インベントリのコンテキストメニューに移動項目があること', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    // テーブル上のオブジェクトを右クリックした場合、「テーブルに移動」は現在地と
    // 同じなので項目化されない。他 3 つのロケーション移動先が表示される。
    await expect(menu.getByText('共有イベントリに移動')).toBeVisible();
    await expect(menu.getByText('個人イベントリに移動')).toBeVisible();
    await expect(menu.getByText('墓場に移動')).toBeVisible();
  });
});
