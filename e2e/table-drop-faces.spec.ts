import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import {
  cellSpot,
  openTableContextMenu,
  putAwayTutorial,
  revealMenuEntry,
  sizeTable,
  spotOnPiece,
  waitAppReady,
} from './helpers';
import { piece, placeOf, Point, settle } from './see-through-helpers';
import { FaceHooks, faceOf, pageOfFace, showWall, standBack, whenDrawn } from './table-face-helpers';

/**
 * A piece let go of over another face than the one it stands on moves onto that face: a white board
 * or a wall of the table. The table finds that face by running the line of sight through the
 * pointer against the faces, which is what a canvas will have to do, so here the pieces are dragged
 * there with the pointer and the face the page then draws them on is read back.
 */

/** Drags from one point to another with the pointer, running `whileHeld` over the end before letting go. */
async function drag(page: Page, from: Point, to: Point, whileHeld?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await whileHeld?.();
  await page.mouse.up();
}

/**
 * The sample piece carried from face to face: one with nothing standing in front of it, whose picture
 * is pressed where it is drawn rather than where a piece before it is.
 */
const CARRIED = '魔法使い';

async function makeBoard(page: Page): Promise<string> {
  const menu = await openTableContextMenu(page, await cellSpot(page, 1.5, 1.5));
  await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
  const face = page.locator('white-board [data-surface]');
  // Over a table drawn on a canvas the face is put once the canvas draws the board.
  await expect(face).toBeVisible({ timeout: 10000 });
  await whenDrawn(page);
  return (await face.getAttribute('data-surface'))!;
}

/**
 * A point of a face, across and down it, that is on the screen and where the table draws the face
 * itself rather than something standing on it, and where that point is drawn.
 */
async function bareSpotOf(page: Page, surface: string): Promise<{ local: Point; onPage: Point }> {
  const spot = await page.evaluate((surface) => {
    const hooks = (window as unknown as { __axeTable: FaceHooks }).__axeTable;
    const size = hooks.surfaceSizeOf(surface);
    if (!size) return null;
    // A white board's face is laid on the screen; a wall of the table has no element of its own.
    const face = document.querySelector(`[data-surface="${surface}"]`);
    const margin = 100;
    for (let y = size.height * 0.98; y > 0; y -= size.height / 40) {
      for (let x = size.width * 0.02; x < size.width; x += size.width / 40) {
        const onPage = hooks.surfacePageOf(surface, x, y);
        if (!onPage || onPage.x < margin || onPage.y < margin) continue;
        if (onPage.x > innerWidth - margin || onPage.y > innerHeight - margin) continue;
        const top = document.elementFromPoint(onPage.x, onPage.y);
        if (!top || top.closest('[data-object-id]') || (face && top.closest('[data-surface]') !== face)) continue;
        // A white board is picked by its own name, which is the name of its face.
        const hit = hooks.pickAt(onPage.x, onPage.y);
        if (hooks.faceAt(onPage.x, onPage.y) === surface && (hit === null || hit === surface)) {
          return { local: { x, y }, onPage };
        }
      }
    }
    return null;
  }, surface);
  expect(spot, `a bare spot of ${surface} on the screen`).not.toBeNull();
  return spot!;
}

test.describe('dropping a piece on another face', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
    await becomeGm(page);
    await sizeTable(page, 20, 15);
    await closePanels(page);
  });

  test('outlines where a piece held over a white board would land, puts it on the board once let go of, and back on the floor off it', async ({
    page,
  }) => {
    const board = await makeBoard(page);
    await standBack(page);
    const character = piece(page, CARRIED);
    await settle(character);
    expect(await faceOf(character)).toBe('floor');
    const to = (await bareSpotOf(page, board)).onPage;
    const outline = page.getByTestId('table-hud').getByTestId('drop-preview');

    await drag(page, await spotOnPiece(character), to, async () => {
      await expect(outline).toBeVisible({ timeout: 5000 });
      const box = (await outline.boundingBox())!;
      const report = JSON.stringify([box, to]);
      expect(Math.abs(box.x + box.width / 2 - to.x), report).toBeLessThan(box.width);
      expect(Math.abs(box.y + box.height / 2 - to.y), report).toBeLessThan(box.height);
    });
    await expect(outline).toHaveCount(0);
    await expect.poll(() => faceOf(character)).toBe(board);

    // The board is not fixed in place, and a press on the piece stuck to it still takes up the piece
    // alone.
    await settle(character);
    const boardPlace = await placeOf(page.locator('white-board'));
    await drag(page, await spotOnPiece(character), (await bareSpotOf(page, 'floor')).onPage);
    await expect.poll(() => faceOf(character)).toBe('floor');
    expect(await placeOf(page.locator('white-board'))).toBe(boardPlace);
  });

  test('puts a piece let go of over a wall drawn with a picture on the wall', async ({ page }) => {
    await showWall(page, '北壁', 'north');
    await whenDrawn(page);
    const character = piece(page, CARRIED);
    await settle(character);

    await drag(page, await spotOnPiece(character), (await bareSpotOf(page, 'north-wall')).onPage);
    await expect.poll(() => faceOf(character)).toBe('north-wall');
  });

  test('moves a white board dragged across the table to where it is let go of, rather than onto itself', async ({
    page,
  }) => {
    const board = await makeBoard(page);
    await standBack(page);
    const grabbed = await bareSpotOf(page, board);
    const to = { x: grabbed.onPage.x - 200, y: grabbed.onPage.y + 300 };

    await drag(page, grabbed.onPage, to);

    await expect(page.locator('white-board [data-surface]')).toHaveAttribute('data-surface', board);
    expect(await faceOf(page.locator('white-board'))).toBe('floor');
    await expect
      .poll(async () => {
        const now = await pageOfFace(page, board, grabbed.local.x, grabbed.local.y);
        return Math.hypot(now.x - to.x, now.y - to.y);
      })
      .toBeLessThan(60);
  });
});
