import { expect, Page, test } from '@playwright/test';

import { buildDungeonUndrawn } from './dungeon-helpers';
import {
  becomeGm,
  closePanels,
  idle,
  openTableContextMenu,
  putAwayTutorial,
  revealMenuEntry,
  waitAppReady,
} from './helpers';

/**
 * Blocks on a table worked through picking alone, with nothing drawn on the canvas: a press where
 * picking finds a block has to reach it, whether the page lays the block out on its own or the
 * canvas draws it together with others.
 */

type Point = { x: number; y: number };

/**
 * Points of the sample room's table where the blocks are set down, in cells: on the open ground east
 * and west of the pieces, each with room for a block two cells across.
 */
const BLOCK_CELLS = [
  { x: 20.5, y: 3 },
  { x: 21, y: 6.5 },
  { x: 20, y: 9.5 },
  { x: 2.5, y: 4 },
  { x: 2, y: 8.5 },
];

/** Where the middle of a cell of the table is, on the page and as an offset into the table's layer. */
async function spotOfCell(page: Page, cell: Point): Promise<{ onPage: Point; spot: Point }> {
  const layer = (await page.locator('#app-table-layer').boundingBox())!;
  const onPage = await page.evaluate(({ x, y }) => window.__axeTable.project(x * 50, y * 50, 0)!, cell);
  return { onPage, spot: { x: onPage.x - layer.x, y: onPage.y - layer.y } };
}

/** Sets a block down at each spot that is bare table, uncovered on the screen, and answers how many were set down. */
async function setBlocksDown(page: Page): Promise<number> {
  let placed = 0;
  for (const cell of BLOCK_CELLS) {
    const { onPage, spot } = await spotOfCell(page, cell);
    const bare = await page.evaluate(({ x, y }) => {
      const front = document.elementFromPoint(x, y);
      return (
        !!front &&
        !!front.closest('#app-table-layer') &&
        !front.closest('[data-object-id], ui-panel') &&
        window.__axeTable.pickAt(x, y) === null
      );
    }, onPage);
    if (!bare) continue;
    const menu = await openTableContextMenu(page, spot);
    await (await revealMenuEntry(page, menu, '地形を作成')).click();
    placed++;
    await expect(page.locator('terrain')).toHaveCount(placed, { timeout: 10000 });
  }
  return placed;
}

/**
 * A point of the page well inside a block as picking finds it, where the page lays no piece over it,
 * and that block; or null where there is none.
 */
function findPointOnBlock(page: Page): Promise<{ x: number; y: number; id: string } | null> {
  return page.evaluate(() => {
    const hooks = window.__axeTable;
    const layer = document.querySelector('#app-table-layer')!;
    for (let y = 120; y < innerHeight - 100; y += 7) {
      for (let x = 140; x < innerWidth - 60; x += 7) {
        const front = document.elementFromPoint(x, y);
        if (!front || !layer.contains(front) || front.closest('[data-object-id]')) continue;
        const picked = hooks.pickAt(x, y);
        const around = [-6, 6].every((dx) => [-6, 6].every((dy) => hooks.pickAt(x + dx, y + dy) === picked));
        if (picked !== null && hooks.aliasOf(picked) === 'terrain' && around) return { x, y, id: picked };
      }
    }
    return null;
  });
}

test.describe('blocks picked by the shapes the canvas draws them with', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
    await becomeGm(page);
    await closePanels(page);
  });

  test('open a block’s menu when it is right-clicked where picking finds it', async ({ page }) => {
    expect(await setBlocksDown(page)).toBeGreaterThanOrEqual(3);
    await idle(page);
    const spot = await findPointOnBlock(page);
    expect(spot, 'a point on a block').not.toBeNull();

    await page.mouse.click(spot!.x, spot!.y, { button: 'right' });

    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('傾斜')).toBeVisible();
  });

  test('open the menu of a block fixed in place, which the canvas draws together with others', async ({ page }) => {
    await buildDungeonUndrawn(page, '四角');
    await idle(page);
    await expect.poll(() => findPointOnBlock(page), { timeout: 20000 }).not.toBeNull();
    const spot = (await findPointOnBlock(page))!;
    expect(await page.locator(`terrain[data-object-id="${spot.id}"]`).count(), 'a block drawn together').toBe(0);

    await page.mouse.click(spot.x, spot.y, { button: 'right' });

    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('傾斜')).toBeVisible();
  });
});
