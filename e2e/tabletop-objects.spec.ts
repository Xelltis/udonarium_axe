import { expect, Page, test } from '@playwright/test';

import { closePanels } from './dungeon-helpers';
import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, settle } from './see-through-helpers';

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
    // The page draws the clear top itself; over a table drawn on a canvas the top is laid on the screen.
    const top = terrain.getByTestId('terrain-glass-face').or(terrain.locator('[data-part="top"]')).first();
    await expect(top).toBeAttached();
    const box = (await top.boundingBox())!;
    const placed = () => terrain.locator(':scope > [data-location]').first().getAttribute('data-location');
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

test.describe('pieces under the pointer', () => {
  test('lists the terrain under a character in the character menu', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    await createObject(page, '地形を作成', 'terrain');
    const layer = (await page.locator('#app-table-layer').boundingBox())!;
    const terrain = { x: layer.x + 900, y: layer.y + 250 };
    const monster = piece(page, 'キャラクターB');
    await settle(monster);
    const from = await centreOf(pedestal(monster));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + terrain.x) / 2, (from.y + terrain.y) / 2, { steps: 6 });
    await page.mouse.move(terrain.x, terrain.y, { steps: 8 });
    await page.mouse.up();
    await settle(monster);

    const at = await centreOf(pedestal(monster));
    await page.mouse.click(at.x, at.y, { button: 'right' });
    const menu = page.locator('context-menu');
    const below = menu.getByText(/^重なっているオブジェクト \(\d+\)$/);
    await expect(below).toBeVisible({ timeout: 5000 });
    await below.hover();
    await expect(menu.getByText(/^地形/).first()).toBeVisible({ timeout: 5000 });
  });
});
