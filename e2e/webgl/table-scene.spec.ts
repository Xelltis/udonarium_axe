import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { waitAppReady } from '../helpers';

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
};

/** The colour the bare board is drawn in on the canvas. */
const BOARD: [number, number, number] = [0x8c, 0x8f, 0x87];
const SAME_COLOUR = 8;
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

function isBoard(colour: number[]): boolean {
  return colour.every((value, index) => Math.abs(value - BOARD[index]) <= SAME_COLOUR);
}

/** Holds the board the canvas draws against where the camera puts its edges. */
async function expectBoardWhereTheCameraPutsIt(page: Page) {
  const points = await edgePoints(page);
  // A phone's screen shows one edge of the board, a desktop's all four.
  expect(points.length, 'edges of the board on the screen with nothing over them').toBeGreaterThanOrEqual(1);
  const colours = await coloursAt(
    page,
    points.flatMap(({ inside, outside }) => [inside, outside])
  );
  for (let i = 0; i < points.length; i++) {
    expect(isBoard(colours[i * 2]), `inside edge ${i}: ${colours[i * 2]}`).toBe(true);
    expect(isBoard(colours[i * 2 + 1]), `outside edge ${i}: ${colours[i * 2 + 1]}`).toBe(false);
  }
}

test.describe('the table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('draws the board where the camera puts it', async ({ page }) => {
    await sceneDrawn(page);
    await expectBoardWhereTheCameraPutsIt(page);
  });

  test('keeps the board where the camera puts it as the view is pulled back', async ({ page }) => {
    await sceneDrawn(page);
    const layer = (await page.locator('#app-table-layer').boundingBox())!;
    await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2);
    for (let notch = 0; notch < 3; notch++) await page.mouse.wheel(0, 300);
    // The view glides there, and the canvas is drawn again on each frame of it.
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.whenIdle());

    await expectBoardWhereTheCameraPutsIt(page);
  });

  test('draws through WebGL2 where the browser gives no WebGPU adapter', async ({ page }) => {
    await sceneDrawn(page);
    expect(await page.evaluate(() => (window as unknown as { __axeTable: SceneHooks }).__axeTable.renderer())).toBe(
      'webgl2'
    );
  });
});

test.describe('a browser that can draw the table through neither interface', () => {
  test('says why the table is not drawn, where the table would be', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      const ownGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (kind === 'webgl2') return null;
        return (ownGetContext as (...args: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await waitAppReady(page);

    await expect(page.getByTestId('table-scene-unavailable')).toBeVisible({ timeout: 15000 });
  });
});
