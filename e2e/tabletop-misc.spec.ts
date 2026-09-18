import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

test.describe('地形 (terrain) の追加コンテキスト操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await tableMenu.getByText('地形を作成').click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
  });

  test('「壁を非表示」を選ぶと次回メニューに「壁を表示」が出ること', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('壁を非表示').click();
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('壁を表示')).toBeVisible({ timeout: 5000 });
  });

  test('「傾斜」サブメニューに、なしと四角い卓の四辺と全方向が並ぶこと', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('傾斜').hover();
    // チェックマークは context-menu 側で視覚ノードから strip されるので li 単位で検証する。
    const items = page.locator('context-menu li');
    for (const side of ['なし', '北', '東', '南', '西', '全方向']) {
      await expect(items.filter({ hasText: side }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('傾斜は複数の辺に設定でき、全方向で角錐になること', async ({ page }) => {
    const faces = page.locator('[data-testid="terrain-slope-face"]');

    await chooseSlope(page, '南');
    await expect(faces).toHaveCount(1);

    await chooseSlope(page, '北');
    await expect(faces).toHaveCount(2);

    await chooseSlope(page, '全方向');
    await expect(faces).toHaveCount(4);

    await chooseSlope(page, '全方向');
    await expect(faces).toHaveCount(0);
  });
});

/** Turns one side of the first terrain's slope on or off from its right-click menu. */
async function chooseSlope(page: Page, side: string) {
  await page.locator('terrain').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('傾斜', { exact: true }).hover();
  await menu
    .locator('li')
    .filter({ hasText: side })
    .first()
    .locator('span')
    .first()
    .dispatchEvent('click', { bubbles: true });
  await page.keyboard.press('Escape');
}

async function createDiceOnTable(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('ダイスを作成').hover();
  await expect(menu.getByText('D6')).toBeVisible({ timeout: 5000 });
  await menu.getByText('D6').click();
  await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 10000 });
}

test.describe('ダイスシンボル ダイス目設定サブメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createDiceOnTable(page);
  });

  test('「ダイス目を設定」サブメニューに数値選択肢が出ること (D6 は 1-6)', async ({ page }) => {
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('ダイス目を設定').hover();
    // D6 は 6 面体なので少なくとも 6 種類の選択肢が出る (◉/○ のラジオマーク付き)。
    const items = page.locator('context-menu li');
    for (const face of ['1', '2', '3', '4', '5', '6']) {
      await expect(items.filter({ hasText: new RegExp(`(?:^|\\s)${face}(?:$|\\s)`) }).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});

test.describe('ダイスの公開/非公開トグル', () => {
  test('「自分だけ見る」を選ぶと次回メニューに「ダイスを公開」が出ること', async ({ page }) => {
    await waitAppReady(page);
    await createDiceOnTable(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    const onlyMe = menu.getByText('自分だけ見る');
    // 既に非公開なら「ダイスを公開」が見える筈なのでスキップ。
    if ((await onlyMe.count()) === 0) {
      test.skip(true, '既定で既に非公開状態のためスキップ');
    }
    await onlyMe.click();
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    await expect(menu.getByText('ダイスを公開')).toBeVisible({ timeout: 5000 });
  });
});
