import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openTableContextMenu, revealMenuEntry, spotOnPiece, waitAppReady } from './helpers';
import { piece, placeOf, Point, settle } from './see-through-helpers';
import { FaceHooks, faceOf, pageOfFace, showWall, whenDrawn } from './table-face-helpers';

/**
 * A piece let go of over another face than the one it stands on moves onto that face: a white board
 * or a wall of the table. The table finds that face by running the line of sight through the
 * pointer against the faces, which is what a canvas will have to do, so here the pieces are dragged
 * there with the pointer and the face the page then draws them on is read back.
 */

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Where the board is made, on the right of the table, clear of the sample room's pieces in the
 * middle of it.
 */
const BOARD_AT = { x: 1040, y: 440 };

/**
 * The sample piece carried from face to face: one with nothing standing in front of it, whose picture
 * is pressed where it is drawn rather than where a piece before it is.
 */
const CARRIED = '魔法使い';

async function makeBoard(page: Page): Promise<string> {
  const menu = await openTableContextMenu(page, BOARD_AT);
  await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
  const face = page.locator('white-board [data-surface]');
  // Over a table drawn on a canvas the face is put once the canvas draws the board.
  await expect(face).toBeVisible({ timeout: 10000 });
  await whenDrawn(page);
  return (await face.getAttribute('data-surface'))!;
}

/**
 * A point of a face, across and down it, that is on the screen and where the page draws the face
 * itself rather than something standing on it, and where that point is drawn.
 */
async function bareSpotOf(page: Page, surface: string): Promise<{ local: Point; onPage: Point }> {
  const spot = await page.evaluate((surface) => {
    const hooks = (window as unknown as { __axeTable: FaceHooks }).__axeTable;
    const face = document.querySelector<HTMLElement>(`[data-surface="${surface}"]`)!;
    const margin = 100;
    for (let y = face.offsetHeight * 0.98; y > 0; y -= face.offsetHeight / 40) {
      for (let x = face.offsetWidth * 0.02; x < face.offsetWidth; x += face.offsetWidth / 40) {
        const onPage = hooks.surfacePageOf(surface, x, y);
        if (!onPage || onPage.x < margin || onPage.y < margin) continue;
        if (onPage.x > innerWidth - margin || onPage.y > innerHeight - margin) continue;
        const top = document.elementFromPoint(onPage.x, onPage.y);
        if (top?.closest('[data-surface]') === face && !top.closest('[data-object-id]')) {
          return { local: { x, y }, onPage };
        }
      }
    }
    return null;
  }, surface);
  expect(spot, `a bare spot of ${surface} on the screen`).not.toBeNull();
  return spot!;
}

/**
 * Draws the camera back from the table, so a board standing behind it is on the screen whole, above
 * the pieces on the table rather than over them.
 */
async function standBack(page: Page) {
  const layer = (await page.locator('#app-table-layer').boundingBox())!;
  await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2);
  const camera = () =>
    page.evaluate(() =>
      JSON.stringify((window as unknown as { __axeTable: { camera(): unknown } }).__axeTable.camera())
    );
  const before = await camera();
  for (let notch = 0; notch < 4; notch++) await page.mouse.wheel(0, 300);
  await expect.poll(camera).not.toBe(before);
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await camera();
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250] }
    )
    .toBe(true);
}

test.describe('dropping a piece on another face', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
  });

  test('puts a piece let go of over a white board on the board, and back on the floor off it', async ({ page }) => {
    const board = await makeBoard(page);
    await standBack(page);
    const character = piece(page, CARRIED);
    await settle(character);
    expect(await faceOf(character)).toBe('floor');

    await drag(page, await spotOnPiece(character), (await bareSpotOf(page, board)).onPage);
    await expect.poll(() => faceOf(character)).toBe(board);

    // The board is not fixed in place, and a press on the piece stuck to it still takes up the piece
    // alone.
    await settle(character);
    const boardPlace = await placeOf(page.locator('white-board'));
    await drag(page, await spotOnPiece(character), (await bareSpotOf(page, 'floor')).onPage);
    await expect.poll(() => faceOf(character)).toBe('floor');
    expect(await placeOf(page.locator('white-board'))).toBe(boardPlace);
  });

  test('outlines where a piece held over a white board would land on it, on a table drawn on a canvas', async ({
    page,
  }) => {
    const board = await makeBoard(page);
    await standBack(page);
    const character = piece(page, CARRIED);
    await settle(character);
    const from = await spotOnPiece(character);
    const to = (await bareSpotOf(page, board)).onPage;
    const outline = page.getByTestId('table-hud').getByTestId('drop-preview');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 8 });

    await expect(outline).toBeVisible({ timeout: 5000 });
    const box = (await outline.boundingBox())!;
    const report = JSON.stringify([box, to]);
    expect(Math.abs(box.x + box.width / 2 - to.x), report).toBeLessThan(box.width);
    expect(Math.abs(box.y + box.height / 2 - to.y), report).toBeLessThan(box.height);
    await page.mouse.up();
    await expect(outline).toHaveCount(0);
  });

  test('puts a piece let go of over a wall drawn with a picture on the wall', async ({ page }) => {
    await showWall(page, '北壁', 'north');
    await expect(page.locator('[data-surface="north-wall"]')).toBeAttached({ timeout: 10000 });
    const character = piece(page, CARRIED);
    await settle(character);

    await drag(page, await spotOnPiece(character), (await bareSpotOf(page, 'north-wall')).onPage);
    await expect.poll(() => faceOf(character)).toBe('north-wall');
  });

  test('moves a white board dragged across the table to where it is let go of, rather than onto itself', async ({
    page,
  }) => {
    const board = await makeBoard(page);
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
