import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

/** The shade laid over every face of every block on the table, as `rgba()` parts. */
async function shadesOnBlocks(page: Page) {
  return page.evaluate(() => {
    const found: { rgb: string; alpha: number }[] = [];
    for (const block of document.querySelectorAll('terrain')) {
      for (const face of block.querySelectorAll('div')) {
        const image = getComputedStyle(face as HTMLElement).backgroundImage;
        for (const stop of image.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/g)) {
          found.push({ rgb: `${stop[1]},${stop[2]},${stop[3]}`, alpha: Number(stop[4]) });
        }
      }
    }
    return found;
  });
}

test.describe('暗闇のなかの地形', () => {
  test('ブロックの面がテーブルの影の色で暗くなること', async ({ page }) => {
    await waitAppReady(page);
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();

    const menu = await openTableContextMenu(page);
    await menu.getByText('地形を作成').click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });

    await page.locator('app-gm-toolbar [title^="暗闇"]').click();
    await expect.poll(() => page.locator('table-vision-overlay canvas').count(), { timeout: 10000 }).toBeGreaterThan(0);

    // The report was from a player's screen, and a game master is shown a lighter table.
    await connection.getByRole('button', { name: /^\s*PL\s*$/ }).click();
    await expect.poll(async () => (await shadesOnBlocks(page)).length, { timeout: 10000 }).toBeGreaterThan(0);

    const shades = await shadesOnBlocks(page);

    // The darkness is one sheet lying on the floor, so a block darkens its own faces. Doing
    // that in black left a building grey while the floor around it wore the table's colour.
    // #05060a is the colour a table starts with.
    for (const shade of shades) expect(shade.rgb).toBe('5,6,10');
  });
});
