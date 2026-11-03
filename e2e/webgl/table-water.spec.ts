import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openTableContextMenu, waitAppReady } from '../helpers';

/**
 * The water on a table drawn on a canvas, which the canvas draws in its own scene from the cells
 * under water, with the page's own drawing of it left out.
 */

type Point = { x: number; y: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { waterParts: number } | null;
};

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function waterParts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.waterParts ?? -1);
}

/** How blue the screen is at a point against its red, read off a picture of it. */
async function bluenessAt(page: Page, point: Point): Promise<number> {
  const shot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ data, point }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const [r, , b] = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
      return b - r;
    },
    { data: shot.toString('base64'), point }
  );
}

test.describe('the water on a table drawn on a canvas', () => {
  test('is drawn in the scene where a pond is laid, and the page draws none of it', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
    const at = { x: 900, y: 250 };
    const table = (await page.locator('#app-table-layer').boundingBox())!;
    const onScreen = { x: table.x + at.x + 20, y: table.y + at.y + 20 };
    const before = await bluenessAt(page, onScreen);
    expect(await waterParts(page)).toBe(0);

    const menu = await openTableContextMenu(page, at);
    await menu.getByText('環境エフェクトを置く').hover();
    await menu.getByText('水', { exact: true }).click();
    await expect(page.locator('table-ambience')).toHaveCount(1);

    await expect.poll(() => waterParts(page)).toBeGreaterThan(0);
    await expect(page.locator('[data-water-surface]')).toHaveCount(0);
    await page.mouse.move(5, 400);
    await idle(page);
    expect(await bluenessAt(page, onScreen)).toBeGreaterThan(before + 10);
  });
});
