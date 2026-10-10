import { expect, test } from '@playwright/test';

import { chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, settleLazy, snap } from './fixtures';

/**
 * A terrain with its own grid switched on, which is the picture the grid raster draws.
 *
 * The lines are cut into a canvas from where the terrain stands, so anything that changes
 * when or how that canvas is cut shows up here.
 */
test('a terrain draws its own grid over its floor', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);

  const menu = await rightClickTable(page, { x: 900, y: 250 });
  await chooseMenu(page, menu, '地形を作成');
  const terrain = page.locator('terrain').last();
  await expect(terrain).toBeAttached();
  await settle(page, 400);

  await terrain.dispatchEvent('contextmenu');
  await settle(page, 400);
  const pieceMenu = page.locator('context-menu');
  await expect(pieceMenu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await pieceMenu.getByText('地形設定を編集', { exact: true }).dispatchEvent('click');
  const gridToggle = page.locator('ui-panel input[name="isGrid"]');
  await settleLazy(page, gridToggle);

  await expect(gridToggle).toBeAttached();
  await gridToggle.dispatchEvent('click');
  await settle(page, 400);

  const sheet = page.locator('ui-panel');
  await sheet.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  await settle(page, 400);
  await expect(sheet).toHaveCount(0);
  await snap(page, 'terrain-grid');
});
