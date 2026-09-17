import { expect, test } from '@playwright/test';

import { chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, snap, useHexGrid } from './fixtures';

/**
 * A map mask on a hex table, whole and then with cells scratched open.
 *
 * The mask is cut to its hexes by an SVG mask built from the grid, so anything that changes how
 * that mask is built or when shows up here.
 */
test('a hex mask covers its cells and opens the ones scratched', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);

  const tableMenu = await rightClickTable(page, { x: 700, y: 450 });
  await chooseMenu(page, tableMenu, 'マップマスクを作成');
  const mask = page.locator('game-table-mask').last();
  await expect(mask).toBeAttached();
  await settle(page, 400);
  await snap(page, 'hex-mask');

  await mask.dispatchEvent('contextmenu');
  await settle(page, 400);
  const maskMenu = page.locator('context-menu');
  await expect(maskMenu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await maskMenu.getByText('スクラッチ開始', { exact: true }).dispatchEvent('click');
  await settle(page, 400);

  const surface = mask.locator('div.pointer-events-auto').first();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  // Kept to the left half of the mask, clear of the piece standing under its right side.
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

  await mask.dispatchEvent('contextmenu');
  await settle(page, 400);
  await expect(maskMenu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await maskMenu.getByText('スクラッチ確定', { exact: true }).dispatchEvent('click');
  await settle(page, 400);
  await snap(page, 'hex-mask-scratched');
});
