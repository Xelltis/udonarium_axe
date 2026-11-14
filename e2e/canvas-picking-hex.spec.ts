import { expect, test } from '@playwright/test';

import { closePanels, createCharacter, idle, openPanel, waitAppReady } from './helpers';
import { boxesOf, made } from './piece-helpers';

/**
 * A piece dragged about a hex table worked through picking alone, with nothing drawn on the canvas:
 * where it is put down is held against the cells of the table, not against the screen.
 */

/**
 * How far a piece of a cell standing at a point of the board stands from the middle of the hex it is
 * in. The hexes of the grid stand flat at the top, a cell of fifty pixels from one flat side to the
 * other: their columns stand a corner and a half apart, every other one half a cell down.
 */
function distanceFromHexMiddle(x: number, y: number): number {
  const middle = { x: x + 25, y: y + 25 };
  const across = (1.5 * 50) / Math.sqrt(3);
  const column = Math.round(middle.x / across);
  const down = Math.abs(column % 2) === 1 ? 25 : 0;
  const centre = { x: column * across, y: Math.round((middle.y - down) / 50) * 50 + down };
  return Math.hypot(middle.x - centre.x, middle.y - centre.y);
}

test.describe('pieces picked on a hex table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('put a character dragged about a hex table at the middle of a cell, as the cell it stands on is wide, not as the screen draws it', async ({
    page,
  }) => {
    await openPanel(page, 'テーブル設定');
    await page.locator('select[name="tableGridType"]').selectOption('1');
    await closePanels(page);
    const id = await made(page, { tag: 'game-character', create: createCharacter, shapes: 1 });
    const [shape] = await boxesOf(page, id);
    const grabX = shape.x + shape.width / 2;
    const grabY = shape.y + shape.height / 2;
    const placed = page.locator(`[data-object-id="${id}"] [data-location]`).first();
    const before = await placed.getAttribute('data-location');

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX - 60, grabY + 20, { steps: 6 });
    await page.mouse.move(grabX - 130, grabY + 47, { steps: 6 });
    await page.mouse.up();
    await idle(page);
    await expect(placed).not.toHaveAttribute('data-location', before!);

    const [x, y] = (await placed.getAttribute('data-location'))!.split(',').map(Number);
    expect(distanceFromHexMiddle(x, y), JSON.stringify({ x, y })).toBeLessThan(1.5);
  });
});
