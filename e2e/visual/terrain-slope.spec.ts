import { expect, test } from '@playwright/test';

import { chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, settleLazy, snap } from './fixtures';

/**
 * The slope of a block, which is built from the sides it runs down to.
 *
 * One side is a ramp up to the side across from it, the way a slope has always read; every side
 * raises a pyramid over the middle. The block is four cells across and two tall, with a picture
 * from the room on it, so the shape of each flat piece of the slope and the walls left standing
 * under it are all in the picture.
 */
test('a block slopes to one side as a ramp and to every side as a pyramid', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);

  const tableMenu = await rightClickTable(page, { x: 900, y: 250 });
  await chooseMenu(page, tableMenu, '地形を作成');
  const terrain = page.locator('terrain').last();
  await expect(terrain).toBeAttached();
  await settle(page, 300);

  // A picture on its faces, since a block with none is drawn as an outline alone.
  await terrain.dispatchEvent('contextmenu');
  await settle(page, 300);
  await page.locator('context-menu').getByText('地形設定を編集', { exact: true }).dispatchEvent('click');
  await settleLazy(page);
  const sheet = page.locator('ui-panel').first();
  for (const face of ['床画像', '壁画像']) {
    await sheet.locator('button', { hasText: face }).first().dispatchEvent('click');
    await settleLazy(page);
    // The knight, which is opaque: the default avatar is a translucent ring and shows nothing.
    await page.locator('modal img').nth(1).dispatchEvent('click');
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
  await expect(page.locator('[data-testid="terrain-slope-face"]')).toHaveCount(1);
  await snap(page, 'terrain-slope-ramp');

  for (const side of ['北', '東', '西']) await slopeTo(page, side);
  await expect(page.locator('[data-testid="terrain-slope-face"]')).toHaveCount(4);
  await snap(page, 'terrain-slope-pyramid');
});

/** Turns the block's slope to one side on or off from its own menu. */
async function slopeTo(page: import('@playwright/test').Page, side: string) {
  await page.locator('terrain').last().dispatchEvent('contextmenu');
  await settle(page, 300);
  const menu = page.locator('context-menu');
  await menu.getByText('傾斜', { exact: true }).hover();
  await settle(page, 300);
  await menu.getByText(side, { exact: true }).dispatchEvent('click');
  await settle(page, 300);
  await page.keyboard.press('Escape');
  await settle(page, 300);
}
