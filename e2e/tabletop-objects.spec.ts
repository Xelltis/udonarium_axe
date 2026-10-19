import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createObject(page: Page, menuName: string, selector: string) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, menuName)).click();
  await expect(page.locator(selector).first()).toBeAttached({ timeout: 10000 });
}

test.describe('shared notes (text-note)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, '共有メモを作成', 'text-note');
  });

  test('offers "edit note" and "make a copy" in the right-click menu', async ({ page }) => {
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('メモを編集')).toBeVisible();
    await expect(menu.getByText('コピーを作る')).toBeVisible();
  });

  test('adds a text-note on copy', async ({ page }) => {
    const before = await page.locator('text-note').count();
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('コピーを作る').click();
    await expect.poll(() => page.locator('text-note').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('turns "lay down" into "stand up" right after it is chosen', async ({ page }) => {
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('寝かせる').click();
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('直立させる')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('map masks (game-table-mask)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, 'マップマスクを作成', 'game-table-mask');
  });

  test('offers "start scratch" in the right-click menu', async ({ page }) => {
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('スクラッチ開始')).toBeVisible();
  });

  test('turns the context menu entry into "confirm scratch" after "start scratch"', async ({ page }) => {
    // onStartScratch only sets mask.owner to one's own userId; the scratch-mask element comes about
    // only once the user actually drags. That the mask is now one's own shows in the next context menu
    // offering "confirm scratch".
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('スクラッチ開始').click();
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('スクラッチ確定')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('terrain', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, '地形を作成', 'terrain');
  });

  test('has a "slope" submenu in the right-click menu', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('傾斜')).toBeVisible();
  });

  test('lets the GM grab terrain made see-through by its top and move it', async ({ page }) => {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    const terrain = page.locator('terrain').first();
    await terrain.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('テクスチャを外して透明にする').click();
    const top = terrain.getByTestId('terrain-glass-face').first();
    await expect(top).toBeAttached();
    const box = (await top.boundingBox())!;
    const placed = () => terrain.evaluate((el) => (el.firstElementChild as HTMLElement).style.transform);
    const before = await placed();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    await expect.poll(placed).not.toBe(before);
  });

  test('offers "hide walls" in the "slope" submenu', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('傾斜').hover();
    await expect(page.locator('context-menu').getByText('壁を非表示')).toBeVisible({ timeout: 5000 });
  });
});
