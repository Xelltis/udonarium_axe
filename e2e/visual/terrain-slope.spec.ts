import { expect, test } from '@playwright/test';

import {
  chooseMenu,
  closePanels,
  drawsOnCanvas,
  freeze,
  prepare,
  rightClickTable,
  settle,
  settleLazy,
  snap,
} from './fixtures';

/** The shelf the pictures the tool is built with are filed on, which the picker shows them under. */
const MATERIALS_TAG = 'テクスチャ';

/** The pictures the tool is built with that the block is dressed in, a floor on its slope and a wall on its sides. */
const FACE_MATERIALS = [
  ['床画像', 'tiles/stone_paving_big.webp'],
  ['壁画像', 'walls/wall_brick.webp'],
] as const;

/**
 * The slope of a block, which is built from the sides it runs down to.
 *
 * One side is a ramp up to the side across from it, the way a slope has always read; every side
 * raises a pyramid over the middle. The block is four cells across and two tall, dressed in a
 * floor and a wall the tool is built with, so the shape of each flat piece of the slope and the
 * walls left standing under it are all in the picture.
 */
test('a block slopes to one side as a ramp and to every side as a pyramid', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);

  const tableMenu = await rightClickTable(page, { x: 1054, y: 276 });
  await chooseMenu(page, tableMenu, '地形を作成');
  const terrain = page.locator('terrain').last();
  await expect(terrain).toBeAttached();
  await settle(page, 300);

  // A picture on its faces, since a block with none is drawn as an outline alone.
  await terrain.dispatchEvent('contextmenu');
  await settle(page, 300);
  await page.locator('context-menu').getByText('地形設定を編集', { exact: true }).dispatchEvent('click');
  const sheet = page.locator('ui-panel').first();
  await settleLazy(page, sheet.locator('button', { hasText: '床画像' }));
  for (const [face, material] of FACE_MATERIALS) {
    await sheet.locator('button', { hasText: face }).first().dispatchEvent('click');
    const shelf = page.locator('modal label', { hasText: MATERIALS_TAG }).first();
    await settleLazy(page, shelf);
    await shelf.click();
    await settle(page, 100);
    const picture = page.locator(`modal img[src$="${material}"]`).first();
    await settleLazy(page, picture);
    await picture.dispatchEvent('click');
    await settle(page, 300);
  }
  const sizes = sheet.locator('input[name="data-value"]');
  for (const [index, cells] of [
    [1, '4'],
    [2, '2'],
    [3, '4'],
  ] as const) {
    const input = sizes.nth(index);
    await input.click();
    await input.press('Control+a');
    await input.pressSequentially(cells);
    await input.press('Tab');
    await settle(page, 200);
  }
  await closePanels(page);
  await settle(page, 400);

  await slopeTo(page, '南');
  if (!drawsOnCanvas()) await expect(page.locator('[data-testid="terrain-slope-face"]')).toHaveCount(1);
  await snap(page, 'terrain-slope-ramp');

  for (const side of ['北', '東', '西']) await slopeTo(page, side);
  if (!drawsOnCanvas()) await expect(page.locator('[data-testid="terrain-slope-face"]')).toHaveCount(4);
  await snap(page, 'terrain-slope-pyramid');
});

/** Turns the block's slope to one side on or off from its own menu. */
async function slopeTo(page: import('@playwright/test').Page, side: string) {
  await page.locator('terrain').last().dispatchEvent('contextmenu');
  await settle(page, 300);
  const menu = page.locator('context-menu');
  await menu.getByText('傾斜', { exact: true }).first().hover();
  await settle(page, 300);
  await menu.getByText(side, { exact: true }).dispatchEvent('click');
  await settle(page, 300);
  await page.keyboard.press('Escape');
  await settle(page, 300);
}
