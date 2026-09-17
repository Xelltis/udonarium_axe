import { expect, test } from '@playwright/test';

import {
  chooseMenu,
  closePanels,
  freeze,
  prepare,
  rightClickTable,
  settle,
  settleLazy,
  snap,
  useHexGrid,
} from './fixtures';

/**
 * A terrain with its own grid switched on, standing on a hex table.
 *
 * The hex grid is cut into the terrain's canvas from where the terrain stands, so anything that
 * changes when or how that canvas is cut on a hex table shows up here.
 */
test('a terrain draws its own hex grid over its floor', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);

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
  await settleLazy(page);

  const gridToggle = page.locator('ui-panel input[name="isGrid"]');
  await expect(gridToggle).toBeAttached();
  await gridToggle.dispatchEvent('click');
  await settle(page, 400);

  const sheet = page.locator('ui-panel');
  await sheet.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  await settle(page, 400);
  await expect(sheet).toHaveCount(0);
  await snap(page, 'hex-terrain-grid');
});
