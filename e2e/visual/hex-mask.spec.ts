import { expect, test } from '@playwright/test';

import { sendMenuEvent } from '../helpers';
import { chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, snap, useHexGrid } from './fixtures';

/**
 * A map mask on a hex table, whole and then with cells scratched open.
 *
 * The mask is cut to its hexes by an SVG mask built from the grid, so anything that changes how
 * that mask is built or when shows up here.
 */
/** A point on the board clear of the sample room's pieces, where the mask is made. */
const BARE_BOARD = { x: 947, y: 486 };

test('a hex mask covers its cells and opens the ones scratched', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);

  const tableMenu = await rightClickTable(page, BARE_BOARD);
  await chooseMenu(page, tableMenu, 'マップマスクを作成');
  const mask = page.locator('game-table-mask').last();
  await expect(mask).toBeAttached();
  // The pointer is left where the menu's entry was, over a piece as often as not, whose card would
  // come up over the mask or not as the moment has it: it is taken back to the bare board.
  await page.mouse.move(BARE_BOARD.x, BARE_BOARD.y);
  await settle(page, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0);
  await snap(page, 'hex-mask');

  await sendMenuEvent(mask);
  await settle(page, 400);
  const maskMenu = page.locator('context-menu');
  await expect(maskMenu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await maskMenu.getByText('スクラッチ開始', { exact: true }).dispatchEvent('click');
  await settle(page, 400);

  const surface = mask.locator('div.pointer-events-auto').first();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  for (const [fx, fy] of [
    [0.2, 0.35],
    [0.3, 0.6],
    [0.4, 0.8],
  ]) {
    await page.mouse.move(box!.x + box!.width * fx, box!.y + box!.height * fy);
    await page.mouse.down();
    await page.mouse.up();
    await settle(page, 300);
  }
  await snap(page, 'hex-mask-scratching');

  await sendMenuEvent(mask);
  await settle(page, 400);
  await expect(maskMenu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await maskMenu.getByText('スクラッチ確定', { exact: true }).dispatchEvent('click');
  await settle(page, 400);
  await snap(page, 'hex-mask-scratched');
});
