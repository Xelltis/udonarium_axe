import { expect, Page, test } from '@playwright/test';

import { closePanels } from './dungeon-helpers';
import {
  openTableContextMenu,
  putAwayTutorial,
  revealMenuEntry,
  spotOnPiece,
  tableMenuSpot,
  waitAppReady,
} from './helpers';
import { piece, settle } from './see-through-helpers';

async function createObject(page: Page, menuName: string, selector: string) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, menuName)).click();
  await expect(page.locator(selector).first()).toBeAttached({ timeout: 10000 });
}

test.describe('terrain', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
    await createObject(page, '地形を作成', 'terrain');
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
});

test.describe('pieces under the pointer', () => {
  test('lists the terrain under a character in the character menu', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    const spot = await tableMenuSpot(page);
    await createObject(page, '地形を作成', 'terrain');
    const layer = (await page.locator('#app-table-layer').boundingBox())!;
    const terrain = { x: layer.x + spot.x, y: layer.y + spot.y };
    const monster = piece(page, 'キャラクターB');
    await settle(monster);
    const from = await spotOnPiece(monster);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + terrain.x) / 2, (from.y + terrain.y) / 2, { steps: 6 });
    await page.mouse.move(terrain.x, terrain.y, { steps: 8 });
    await page.mouse.up();
    await settle(monster);

    await page.mouse.move(5, 400);
    const at = await spotOnPiece(monster);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    const menu = page.locator('context-menu');
    const below = menu.getByText(/^重なっているオブジェクト \(\d+\)$/);
    await expect(below).toBeVisible({ timeout: 5000 });
    await below.hover();
    await expect(menu.getByText(/^地形/).first()).toBeVisible({ timeout: 5000 });
  });
});
