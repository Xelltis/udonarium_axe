import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createCircleRange(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('射程範囲を作成').hover();
  await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText('円形', { exact: true }).click();
  await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
}

async function openRangeMenu(page: Page) {
  await page.locator('range').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('射程範囲 (range-area) のコンテキストメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCircleRange(page);
  });

  test('「形状変更」サブメニューに 7 種類の形状が含まれること', async ({ page }) => {
    const menu = await openRangeMenu(page);
    await menu.getByText('形状変更').hover();
    for (const shape of ['直線', 'コーン', '三角形', '四角形', '五角形', '六角形', '円形']) {
      await expect(menu.getByText(shape)).toBeVisible({ timeout: 5000 });
    }
  });

  test('「射程範囲を編集」で詳細パネルが開けること', async ({ page }) => {
    const menu = await openRangeMenu(page);
    await menu.getByText('射程範囲を編集').click();
    // 範囲シートもgame-character-sheet上にホストされる（rangeArea === trueの経路）。
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('「削除する」で range が DOM から消えること', async ({ page }) => {
    const before = await page.locator('range').count();
    const menu = await openRangeMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('range').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('「コピーを作る」で range が増えること', async ({ page }) => {
    const before = await page.locator('range').count();
    const menu = await openRangeMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('range').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });
});
