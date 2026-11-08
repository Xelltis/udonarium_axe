import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import {
  cellSpot,
  openTableContextMenu,
  putAwayTutorial,
  revealMenuEntry,
  sizeTable,
  turnByHandle,
  waitAppReady,
} from './helpers';

/**
 * A white board's face is laid on the screen over the canvas, where the table works out from its
 * camera and the face's frame that the face is drawn. Here a small box is put at points of the face
 * the screen lays, and where the page draws it is held against where the frame says that point is
 * drawn.
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

/** Rests the pointer on a point of a face that is on the screen and that nothing else lies over. */
async function hoverBareOf(page: Page, face: Locator) {
  const at = await face.evaluate((element) => {
    const box = element.getBoundingClientRect();
    for (let y = Math.max(box.top, 60); y < Math.min(box.bottom, innerHeight - 60); y += 12) {
      for (let x = Math.max(box.left, 60); x < Math.min(box.right, innerWidth - 60); x += 12) {
        if (document.elementFromPoint(x, y)?.closest('white-board [data-surface]') === element) return { x, y };
      }
    }
    return null;
  });
  expect(at, 'a bare point of the face on the screen').not.toBeNull();
  await page.mouse.move(at!.x, at!.y, { steps: 3 });
}

/** Sets the white board's angle from its menu, by the whole name of an angle it is not at already. */
async function pitchBoard(page: Page, label: string) {
  await page.locator('white-board [data-surface]').dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await (await revealMenuEntry(page, menu, '角度')).hover();
  await (await revealMenuEntry(page, menu, label, true)).click();
}

test.describe('the faces things are put on', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
    await becomeGm(page);
    await sizeTable(page, 20, 15);
    await closePanels(page);
  });

  test('puts a point of a white board where the page draws it, standing, lying, leaning and once it has been turned', async ({
    page,
  }) => {
    const menu = await openTableContextMenu(page, await cellSpot(page, 1.5, 1.5));
    await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
    const face = page.locator('white-board [data-surface]');
    // Over a table drawn on a canvas the face is put once the canvas draws the board.
    await expect(face).toBeVisible({ timeout: 10000 });
    const board = (await face.getAttribute('data-surface'))!;
    await expect.poll(() => farthestApart(face, board), { timeout: 5000, message: 'standing' }).toBeLessThan(SLACK_PX);
    for (const label of ['寝かせる', '斜めに立てる']) {
      await pitchBoard(page, label);
      await expect.poll(() => farthestApart(face, board), { timeout: 5000, message: label }).toBeLessThan(SLACK_PX);
    }

    const before = await face.evaluate((element) => element.getBoundingClientRect().toJSON() as object);
    // The frame that turns the board comes out with the pointer over the board.
    await hoverBareOf(page, face);
    const knob = page.locator('white-board [data-testid="turn-frame-knob"]').nth(2);
    await expect(knob).toBeVisible({ timeout: 5000 });
    await turnByHandle(page, knob);
    await expect
      .poll(() => face.evaluate((element) => element.getBoundingClientRect().toJSON() as object))
      .not.toEqual(before);
    await expect.poll(() => farthestApart(face, board), { timeout: 5000, message: 'turned' }).toBeLessThan(SLACK_PX);
  });
});
