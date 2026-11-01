import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openTableContextMenu, revealMenuEntry, turnByHandle, waitAppReady } from './helpers';

/**
 * The table works out what a press lands on by running the line of sight against the shapes of
 * what stands on it, which is what a canvas will have to do. While the table is still drawn in
 * the page, the page itself says what is drawn at a point, and the two are held against each
 * other here over a few blocks, each drawn on its own.
 */

interface Comparison {
  /** Points on a block where the page draws in front what is picked. */
  agree: number;
  disagree: number;
  samples: { x: number; y: number; drawn: string | null; picked: string | null }[];
}

type Hooks = {
  pickAt(x: number, y: number): string | null;
  drawnAt(x: number, y: number): string | null;
  aliasOf(identifier: string): string | null;
  edgesOnPage(): [number, number, number, number][];
};

/** How near an edge of a solid a point may lie and still be told apart differently, in pixels. */
const EDGE_SLACK_PX = 3;

/** Points of the table, where the blocks are set down, as offsets into the table's layer. */
const BLOCK_SPOTS = [
  { x: 330, y: 300 },
  { x: 560, y: 330 },
  { x: 780, y: 290 },
  { x: 420, y: 470 },
  { x: 700, y: 480 },
  { x: 930, y: 430 },
];

async function useGrid(page: Page, gridType: string) {
  await page.locator('#app-table-layer').click({ button: 'right', position: { x: 900, y: 250 } });
  const entry = page.locator('context-menu').getByText('テーブル設定', { exact: true });
  await expect(entry).toBeVisible({ timeout: 15000 });
  await entry.click();
  const select = page.locator('modal select[name="tableGridType"]');
  await expect(select).toBeVisible({ timeout: 20000 });
  await select.selectOption(gridType);
  await page.locator('modal button', { hasText: 'close' }).first().dispatchEvent('click');
  await expect(page.locator('modal')).toHaveCount(0);
}

/** Sets a block down at each spot that is bare table. */
async function setBlocksDown(page: Page): Promise<number> {
  let placed = 0;
  for (const spot of BLOCK_SPOTS) {
    const layer = (await page.locator('#app-table-layer').boundingBox())!;
    const bare = await page.evaluate(
      ({ x, y }) => (window as unknown as { __axeTable: Hooks }).__axeTable.drawnAt(x, y) === null,
      { x: layer.x + spot.x, y: layer.y + spot.y }
    );
    if (!bare) continue;
    const menu = await openTableContextMenu(page, spot);
    await (await revealMenuEntry(page, menu, '地形を作成')).click();
    placed++;
    await expect(page.locator('terrain')).toHaveCount(placed, { timeout: 10000 });
  }
  return placed;
}

/**
 * Holds what is picked against what the page draws in front, over the points where either is a
 * block, leaving out those on the very edge of one.
 */
function compare(page: Page): Promise<Comparison> {
  return page.evaluate((slack) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const layer = document.querySelector('#app-table-layer')!;
    const edges = hooks.edgesOnPage();
    const nearEdge = (x: number, y: number) =>
      edges.some(([x1, y1, x2, y2]) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const along = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy)) < slack;
      });
    const result: Comparison = { agree: 0, disagree: 0, samples: [] };
    for (let y = 90; y < innerHeight - 60; y += 7) {
      for (let x = 60; x < innerWidth - 60; x += 7) {
        const front = document.elementFromPoint(x, y);
        // A handle for turning a block stays a page element above the table when the table is drawn
        // on a canvas, so a press on one never reaches picking.
        if (!front || !layer.contains(front) || front.closest('.rotate-grab')) continue;
        const drawn = hooks.drawnAt(x, y);
        // Only terrain is picked so far, so points where the page draws a piece in front are left out.
        if (drawn !== null && hooks.aliasOf(drawn) !== 'terrain') continue;
        const picked = hooks.pickAt(x, y);
        if ((drawn === null && picked === null) || nearEdge(x, y)) continue;
        if (drawn === picked) result.agree++;
        else {
          result.disagree++;
          if (result.samples.length < 8) result.samples.push({ x, y, drawn, picked });
        }
      }
    }
    return result;
  }, EDGE_SLACK_PX);
}

test.describe('picking what stands on the table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
  });

  for (const [grid, gridType] of [
    ['square', '0'],
    ['vertical hex', '1'],
    ['horizontal hex', '2'],
  ]) {
    test(`lands on the block the page draws at a point, on a ${grid} grid`, async ({ page }) => {
      await useGrid(page, gridType);
      expect(await setBlocksDown(page)).toBeGreaterThanOrEqual(4);
      await page.waitForLoadState('networkidle');

      const compared = await compare(page);
      const total = compared.agree + compared.disagree;
      expect(total).toBeGreaterThan(300);
      expect(compared.disagree / total, JSON.stringify(compared.samples)).toBeLessThan(0.01);
    });

    test(`lands on a block the page draws at a point once it has been turned, on a ${grid} grid`, async ({ page }) => {
      await useGrid(page, gridType);
      expect(await setBlocksDown(page)).toBeGreaterThanOrEqual(4);
      const edges = () =>
        page.evaluate(() => JSON.stringify((window as unknown as { __axeTable: Hooks }).__axeTable.edgesOnPage()));
      const before = await edges();
      await turnByHandle(page, page.locator('terrain').first().locator('.rotate-grab').last());
      await expect.poll(edges).not.toBe(before);
      // A block let go of glides the rest of the way to the angle it snaps to.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((animation) => !(animation instanceof CSSTransition) || animation.playState !== 'running')
      );
      await page.waitForLoadState('networkidle');

      const compared = await compare(page);
      const total = compared.agree + compared.disagree;
      expect(compared.disagree / total, JSON.stringify(compared.samples)).toBeLessThan(0.01);
    });
  }
});
