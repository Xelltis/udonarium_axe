import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createCircleRange(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('射程範囲を作成').hover();
  await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText('円形', { exact: true }).click();
  await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
}

async function createSquareRange(page: Page, as: 'ダイヤとして出力' | '四角形として出力') {
  const menu = await openTableContextMenu(page);
  await menu.getByText('射程範囲を作成').hover();
  await menu.getByText('四角形・ダイヤ', { exact: true }).hover();
  await expect(menu.getByText(as, { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText(as, { exact: true }).click();
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
    for (const shape of ['直線', 'コーン', '三角形', '四角形・ダイヤ', '五角形', '六角形', '円形']) {
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

test.describe('射程範囲の四角形とダイヤ', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('作成メニューの「四角形・ダイヤ」から「ダイヤとして出力」で作り、形状変更でダイヤに印が付くこと', async ({
    page,
  }) => {
    await createSquareRange(page, 'ダイヤとして出力');

    const menu = await openRangeMenu(page);
    await menu.getByText('形状変更').hover();
    await menu.getByText('✔ 四角形・ダイヤ', { exact: true }).hover();
    await expect(menu.getByText('✔ ダイヤとして出力')).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('四角形として出力', { exact: true })).toBeVisible();
  });

  test('Alt を押しながら回すと 45° ごとにそろい、回しているあいだ角度とヘルプが出ること', async ({ page }) => {
    await createSquareRange(page, '四角形として出力');
    const range = page.locator('range').first();
    await range.locator('canvas').first().hover({ force: true });
    const grab = range.locator('.rotate-grab').first();
    const box = await grab.boundingBox();
    const centre = await range.locator('[approtable]').first().boundingBox();
    if (!box || !centre) throw new Error('the range is not on screen');
    const cx = centre.x + centre.width / 2;
    const cy = centre.y + centre.height / 2;
    const radius = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const hint = page.getByTestId('rotate-hint');
    for (const degrees of [-80, -70, -60]) {
      const rad = (degrees * Math.PI) / 180;
      await page.mouse.move(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius, { steps: 3 });
    }
    await expect(hint).toBeVisible();
    await expect(page.getByTestId('rotate-hint-snap')).toContainText('Alt を押しているあいだ 45° ごとにそろえる');
    const free = Number((await page.getByTestId('rotate-hint-angle').textContent())?.replace('°', ''));
    expect(free % 45).not.toBe(0);

    await page.keyboard.down('Alt');
    await expect(page.getByTestId('rotate-hint-snap')).toContainText('45° ごとにそろえています');
    const snapped = Number((await page.getByTestId('rotate-hint-angle').textContent())?.replace('°', ''));
    expect(snapped % 45).toBe(0);

    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(hint).toHaveCount(0);
  });
});
