import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openTableContextMenu, revealMenuEntry, turnByHandle, waitAppReady } from './helpers';
import { showWall } from './table-face-helpers';

/**
 * Things are put on five faces of the table and on white boards. A canvas has no elements for those
 * faces, so the table works out where a point of each lands from its camera and the face's frame.
 * Here a small box is put at points of each face the page draws, and where the page draws it is
 * held against where the frame says that point is drawn.
 */

type Hooks = {
  surfacePageOf(surface: string, x: number, y: number): { x: number; y: number } | null;
};

const LOCAL_POINTS = [
  [10, 10],
  [120, 40],
  [60, 130],
  [180, 90],
];

/** How far apart the page and the frame may put a point, in pixels. */
const SLACK_PX = 0.5;

/** The greatest distance between where the page draws points of a face and where its frame puts them. */
async function farthestApart(face: Locator, surface: string): Promise<number> {
  return face.evaluate(
    (element, { surface, points }) => {
      const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
      let farthest = 0;
      for (const [x, y] of points) {
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:0;top:0;width:2px;height:2px;transform:translate3d(${x - 1}px,${y - 1}px,0)`;
        element.appendChild(box);
        const drawn = box.getBoundingClientRect();
        box.remove();
        const framed = hooks.surfacePageOf(surface, x, y)!;
        farthest = Math.max(
          farthest,
          Math.hypot(drawn.left + drawn.width / 2 - framed.x, drawn.top + drawn.height / 2 - framed.y)
        );
      }
      return farthest;
    },
    { surface, points: LOCAL_POINTS }
  );
}

async function pitchBoard(page: Page, label: string) {
  await page.locator('white-board [data-surface]').dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await (await revealMenuEntry(page, menu, '角度')).hover();
  await (await revealMenuEntry(page, menu, label)).click();
}

test.describe('the faces things are put on', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
  });

  test('puts a point of the floor where the page draws it', async ({ page }) => {
    expect(await farthestApart(page.locator('#app-game-table'), 'floor')).toBeLessThan(SLACK_PX);
  });

  test('puts a point of a wall where the page draws it', async ({ page }) => {
    await showWall(page, '北壁', 'north');
    await showWall(page, '東壁', 'east');
    for (const surface of ['north-wall', 'east-wall']) {
      const face = page.locator(`[data-surface="${surface}"]`);
      await expect(face).toBeAttached({ timeout: 10000 });
      expect(await farthestApart(face, surface), surface).toBeLessThan(SLACK_PX);
    }
  });

  test('puts a point of a white board where the page draws it, lying, leaning and standing', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
    const face = page.locator('white-board [data-surface]');
    await expect(face).toBeAttached({ timeout: 10000 });
    const board = (await face.getAttribute('data-surface'))!;
    expect(await farthestApart(face, board), 'lying').toBeLessThan(SLACK_PX);
    for (const label of ['斜めに立てる', '立てる']) {
      await pitchBoard(page, label);
      await expect.poll(() => farthestApart(face, board), { timeout: 5000, message: label }).toBeLessThan(SLACK_PX);
    }
  });

  test('puts a point of a white board where the page draws it once it has been turned', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
    const face = page.locator('white-board [data-surface]');
    await expect(face).toBeAttached({ timeout: 10000 });
    const board = (await face.getAttribute('data-surface'))!;
    await pitchBoard(page, '斜めに立てる');
    const before = await face.evaluate((element) => element.getBoundingClientRect().toJSON() as object);
    await turnByHandle(page, page.locator('white-board .rotate-grab').nth(1));
    await expect
      .poll(() => face.evaluate((element) => element.getBoundingClientRect().toJSON() as object))
      .not.toEqual(before);
    await expect.poll(() => farthestApart(face, board), { timeout: 5000 }).toBeLessThan(SLACK_PX);
  });
});
