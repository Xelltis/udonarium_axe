import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, openTableContextMenu, revealMenuEntry, waitAppReady } from '../helpers';

/**
 * Blocks drawn on the canvas. The table picks a block by the shape the scene is built from, so the
 * canvas has to draw each block exactly there: what a change to the table changes on the screen is
 * held against where picking says a block is.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  pickAt(x: number, y: number): string | null;
  aliasOf(identifier: string): string | null;
  edgesOnPage(): [number, number, number, number][];
  drawnAt(x: number, y: number): string | null;
};

/** What changed on the screen between two pictures of it, on blocks and off them. */
interface Changes {
  block: number;
  blockChanged: number;
  bare: number;
  bareChanged: number;
}

/** Points of the table, where the blocks are set down, as offsets into the table's layer. */
const BLOCK_SPOTS = [
  { x: 330, y: 300 },
  { x: 560, y: 330 },
  { x: 780, y: 290 },
  { x: 420, y: 470 },
  { x: 930, y: 430 },
];

/** How near an edge of a block a point may lie and be left out, in pixels. */
const EDGE_SLACK_PX = 3;
const STEP_PX = 9;

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** A picture of the screen, read into the page so its colours can be looked up there. */
async function grabScreen(page: Page): Promise<void> {
  const shot = await page.screenshot({ scale: 'css' });
  await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const kept = (window as unknown as { __shots?: ImageData[] }).__shots ?? [];
    kept.push(canvas.getContext('2d')!.getImageData(0, 0, image.width, image.height));
    (window as unknown as { __shots: ImageData[] }).__shots = kept;
  }, shot.toString('base64'));
}

/** Sets a block down at each spot that is bare table, and answers how many were set down. */
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
 * What changed between the last two pictures of the screen, at points where picking says a block
 * stands and at points where it says none does, leaving out points on the very edge of a block and
 * points the page draws a piece over.
 */
function changesBetweenShots(page: Page): Promise<Changes> {
  return page.evaluate(
    ({ slack, step }) => {
      const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
      const shots = (window as unknown as { __shots: ImageData[] }).__shots;
      const [before, after] = shots.slice(-2);
      const layer = document.querySelector('#app-table-layer')!;
      const edges = hooks.edgesOnPage();
      const nearEdge = (x: number, y: number) =>
        edges.some(([x1, y1, x2, y2]) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const along = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy)) < slack;
        });
      const changed = (x: number, y: number) => {
        const at = (y * before.width + x) * 4;
        return Math.max(...[0, 1, 2].map((c) => Math.abs(before.data[at + c] - after.data[at + c]))) > 6;
      };
      const result = { block: 0, blockChanged: 0, bare: 0, bareChanged: 0 };
      for (let y = 90; y < innerHeight - 60; y += step) {
        for (let x = 140; x < innerWidth - 60; x += step) {
          const front = document.elementFromPoint(x, y);
          if (!front || !layer.contains(front) || front.closest('[data-object-id]')) continue;
          if (nearEdge(x, y)) continue;
          const picked = hooks.pickAt(x, y);
          if (picked !== null && hooks.aliasOf(picked) === 'terrain') {
            result.block++;
            if (changed(x, y)) result.blockChanged++;
          } else {
            result.bare++;
            if (changed(x, y)) result.bareChanged++;
          }
        }
      }
      return result;
    },
    { slack: EDGE_SLACK_PX, step: STEP_PX }
  );
}

test.describe('blocks drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
  });

  test('are drawn where picking says they stand, and nowhere else', async ({ page }) => {
    await idle(page);
    await grabScreen(page);

    expect(await setBlocksDown(page)).toBeGreaterThanOrEqual(3);
    await idle(page);
    await grabScreen(page);

    const changes = await changesBetweenShots(page);
    expect(changes.block, 'points on blocks').toBeGreaterThan(200);
    const wrong = changes.block - changes.blockChanged + changes.bareChanged;
    expect(wrong / (changes.block + changes.bare), JSON.stringify(changes)).toBeLessThan(0.01);
  });

  test('lay the grid over the bare board and under themselves', async ({ page }) => {
    expect(await setBlocksDown(page)).toBeGreaterThanOrEqual(3);
    await idle(page);
    await grabScreen(page);

    await openPanel(page, 'テーブル設定');
    await page.locator('input[name="tableGridShow"]').check();
    await closePanels(page);
    await idle(page);
    await grabScreen(page);

    const changes = await changesBetweenShots(page);
    expect(changes.bareChanged / changes.bare, `the grid shows: ${JSON.stringify(changes)}`).toBeGreaterThan(0.01);
    expect(changes.blockChanged / changes.block, `the blocks hide it: ${JSON.stringify(changes)}`).toBeLessThan(0.01);
  });
});
