import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { waitAppReady } from '../helpers';

/**
 * The darkness over a table drawn on a canvas, which the canvas lays over its own scene from the
 * page's darkness, with the page's own drawing of it kept out of sight.
 */

type Point = { x: number; y: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  project(x: number, y: number, z: number): Point | null;
  pickAt(pageX: number, pageY: number): string | null;
  sceneStats(): { veilRevision: number; shadowCasters: number; draws: number } | null;
};

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** Points of the board with nothing standing on them, as the camera puts them on the screen. */
async function bareBoard(page: Page): Promise<Point[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const layer = document.querySelector('#app-table-layer')!;
    const points: Point[] = [];
    for (let y = 100; y <= 900; y += 100) {
      for (let x = 100; x <= 900; x += 100) {
        const at = hooks.project(x, y, 0);
        if (!at || at.x < 0 || at.y < 0 || at.x >= innerWidth || at.y >= innerHeight) continue;
        const front = document.elementFromPoint(at.x, at.y);
        if (!front || !layer.contains(front) || front.closest('[data-object-id]')) continue;
        if (hooks.pickAt(at.x, at.y) !== null) continue;
        points.push(at);
      }
    }
    return points;
  });
}

/** How bright the screen is at points, the red, green and blue added up, read off a picture of it. */
async function brightnessAt(page: Page, points: Point[]): Promise<number[]> {
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
      return points.map((point) => {
        const [r, g, b] = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return r + g + b;
      });
    },
    { data: shot.toString('base64'), points }
  );
}

test.describe('the darkness over a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('is laid over the board by the canvas, the page’s own drawing of it kept out of sight', async ({ page }) => {
    const points = await bareBoard(page);
    expect(points.length).toBeGreaterThan(3);
    const lit = await brightnessAt(page, points);

    await page.locator('app-gm-toolbar [title^="暗闇"]').click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.veilRevision)
      )
      .toBeGreaterThan(0);
    await expect(page.locator('table-vision-overlay canvas')).toHaveClass(/invisible/);
    await idle(page);

    const dark = await brightnessAt(page, points);
    const bright = lit.map((value, index) => ({ lit: value, dark: dark[index] })).filter((point) => point.lit > 90);
    expect(bright.length).toBeGreaterThan(2);
    // Where a piece's own light falls the board stays lit, so most of it darkens rather than all.
    expect(bright.filter((point) => point.dark < point.lit * 0.8).length).toBeGreaterThan(bright.length / 2);

    await page.locator('app-gm-toolbar [title^="暗闇"]').click();
    await idle(page);
    await expect
      .poll(async () => {
        const again = await brightnessAt(page, points);
        return again.filter((value, index) => Math.abs(value - lit[index]) <= 9).length;
      })
      .toBe(points.length);
  });

  test('stands boards for the shadows the pieces standing on the board throw', async ({ page }) => {
    const pieces = await page.locator('game-character').count();
    expect(pieces).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.shadowCasters)
      )
      .toBe(pieces);
  });

  test('draws nothing again once what it was loading has come, while nothing on the table changes', async ({
    page,
  }) => {
    const draws = () =>
      page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.draws ?? -1);
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
    await page.waitForTimeout(2000);

    expect(await draws()).toBe(settled);
  });
});
