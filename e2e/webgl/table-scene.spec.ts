import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { putAwayTutorial, waitAppReady } from '../helpers';

/**
 * The table drawn on a canvas through three.js, for a seat that has asked for it. The board is drawn
 * there, under what the page still draws itself, and it has to lie exactly where the page's own
 * camera puts it, so the edges of the board the canvas draws are held against the camera's.
 */

type Point = { x: number; y: number };

type SceneHooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneBoard(): { widthPx: number; depthPx: number } | null;
  project(x: number, y: number, z: number): Point | null;
  sceneStats(): { draws: number } | null;
};

/** How far apart two readings of one point may be and still be the same colour. */
const SAME_COLOUR = 3;
/** How far inside and outside an edge of the board the colour is read, in pixels. */
const AWAY_PX = 6;

async function sceneDrawn(page: Page) {
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __axeTable?: SceneHooks }).__axeTable?.renderer() ?? null),
      {
        timeout: 20000,
      }
    )
    .not.toBeNull();
  await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.whenIdle());
  await expect(page.getByTestId('table-scene-cover')).toHaveCount(0);
}

/**
 * Points just inside and just outside the middle of each edge of the board, as the camera puts them
 * on the screen, where nothing of the page but the table itself is drawn over the canvas.
 */
async function edgePoints(page: Page): Promise<{ inside: Point; outside: Point }[]> {
  return page.evaluate((away) => {
    const hooks = (window as unknown as { __axeTable: SceneHooks }).__axeTable;
    const board = hooks.sceneBoard()!;
    const { widthPx: w, depthPx: d } = board;
    // The middle of each edge, with the way into the board from it.
    const edges = [
      { at: [w / 2 + 25, 0], into: [0, 1] },
      { at: [w, d / 2 + 25], into: [-1, 0] },
      { at: [w / 2 + 25, d], into: [0, -1] },
      { at: [0, d / 2 + 25], into: [1, 0] },
    ];
    const layer = document.querySelector('#app-table-layer')!;
    const clear = (point: { x: number; y: number }) => {
      if (point.x < 0 || point.y < 0 || point.x >= innerWidth || point.y >= innerHeight) return false;
      const front = document.elementFromPoint(point.x, point.y);
      return !!front && layer.contains(front) && !front.closest('[data-object-id]');
    };
    return edges
      .map(({ at, into }) => {
        const edge = hooks.project(at[0], at[1], 0)!;
        const inner = hooks.project(at[0] + into[0] * 10, at[1] + into[1] * 10, 0)!;
        const length = Math.hypot(inner.x - edge.x, inner.y - edge.y) || 1;
        const ux = (inner.x - edge.x) / length;
        const uy = (inner.y - edge.y) / length;
        return {
          inside: { x: edge.x + ux * away, y: edge.y + uy * away },
          outside: { x: edge.x - ux * away, y: edge.y - uy * away },
        };
      })
      .filter(({ inside, outside }) => clear(inside) && clear(outside));
  }, AWAY_PX);
}

/** The colours the screen shows at points, read off a picture of it. */
async function coloursAt(page: Page, points: Point[]): Promise<number[][]> {
  const shot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return points.map((point) =>
        Array.from(context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data.slice(0, 3))
      );
    },
    { data: shot.toString('base64'), points }
  );
}

function apart(a: number[], b: number[]): number {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}

/**
 * Holds the board the canvas draws against where the camera puts its edges: hiding the canvas
 * changes what shows just inside an edge, where the canvas draws the board, and leaves what shows
 * just outside it, where the canvas draws nothing. At least as many edges as asked have to be on the
 * screen.
 */
async function expectBoardWhereTheCameraPutsIt(page: Page, least = 1) {
  const points = await edgePoints(page);
  // A phone's screen shows one edge of the board, a desktop's all four.
  expect(points.length, 'edges of the board on the screen with nothing over them').toBeGreaterThanOrEqual(least);
  const read = points.flatMap(({ inside, outside }) => [inside, outside]);
  const canvas = page.getByTestId('table-scene');
  const shown = await coloursAt(page, read);
  await canvas.evaluate((element) => (element.style.visibility = 'hidden'));
  const behind = await coloursAt(page, read);
  await canvas.evaluate((element) => (element.style.visibility = ''));
  for (let i = 0; i < points.length; i++) {
    const inside = i * 2;
    const outside = i * 2 + 1;
    expect(
      apart(shown[inside], behind[inside]),
      `inside edge ${i}: ${shown[inside]} over ${behind[inside]}`
    ).toBeGreaterThan(SAME_COLOUR * 2);
    expect(
      apart(shown[outside], behind[outside]),
      `outside edge ${i}: ${shown[outside]} over ${behind[outside]}`
    ).toBeLessThanOrEqual(SAME_COLOUR);
  }
}

/** Waits for the view to glide to where it was sent and for the canvas to draw it there. */
async function viewSettled(page: Page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.whenIdle());
}

/**
 * Holds the canvas to drawing nothing again while nothing on the table changes, once what it was
 * loading has come: a frame asked for over and over would keep a graphics card busy for nothing.
 */
async function expectNothingDrawnWhileNothingChanges(page: Page) {
  const draws = () =>
    page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.sceneStats()?.draws ?? -1);
  let settled = await draws();
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(1000);
        const now = await draws();
        const still = now === settled;
        settled = now;
        return still;
      },
      { timeout: 15000 }
    )
    .toBe(true);
  await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.whenIdle());
  settled = await draws();
  await page.waitForTimeout(2000);
  expect(await draws(), 'frames drawn while nothing changed').toBe(settled);
}

/**
 * The table drawn on a canvas, with the first table's tutorial put away: its board stands over the
 * north edge of the table, which the canvas draws past the edge. Seen from near the middle of the
 * table, a phone's screen shows no edge of the board, so a phone holds the board to the camera only
 * once the view is pulled back far enough to bring an edge in.
 */
test.describe('the table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
    await closePanels(page);
  });

  test('draws the board where the camera puts it', async ({ page }) => {
    await sceneDrawn(page);
    const expected = test.info().project.name === 'chromium-webgpu' ? 'webgpu' : 'webgl2';
    expect(await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.renderer())).toBe(
      expected
    );
    await expectBoardWhereTheCameraPutsIt(page, test.info().project.use.isMobile ? 0 : 1);
    await expectNothingDrawnWhileNothingChanges(page);

    const layer = (await page.locator('#app-table-layer').boundingBox())!;
    await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2);
    for (let notch = 0; notch < 3; notch++) await page.mouse.wheel(0, 300);
    await viewSettled(page);
    for (let notch = 0; notch < 8 && (await edgePoints(page)).length === 0; notch++) {
      await page.mouse.wheel(0, 300);
      await viewSettled(page);
    }

    await expectBoardWhereTheCameraPutsIt(page);
  });

  test('draws the board again on a fresh canvas once the graphics card lets the drawing go', async ({ page }) => {
    test.skip(test.info().project.name === 'chromium-webgpu', 'a WebGPU device cannot be lost from the page');
    await sceneDrawn(page);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="table-scene"]')!;
      canvas.dataset['lost'] = '';
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    });

    await expect(page.locator('[data-testid="table-scene"][data-lost]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByTestId('table-scene')).toHaveCount(1);
    await sceneDrawn(page);
    await expectBoardWhereTheCameraPutsIt(page);
  });
});
