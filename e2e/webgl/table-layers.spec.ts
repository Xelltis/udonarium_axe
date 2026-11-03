import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';
import { solidPng } from '../png-helpers';

/**
 * The pictures a table lays under and over its board, as a table drawn on a canvas draws them: in
 * its own scene, over the board's picture and under everything standing on it, with the page's own
 * drawing of them left out.
 */

type Point = { x: number; y: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  project(x: number, y: number, z: number): Point | null;
  pickAt(pageX: number, pageY: number): string | null;
  sceneStats(): { layers: number; draws: number } | null;
};

const RED = { name: 'red-mist.png', buffer: solidPng(400, 60, [220, 30, 30]) };

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function stats(page: Page) {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats());
}

/** Lays a layer of a red picture over the board from the table's settings. */
async function layOver(page: Page): Promise<Locator> {
  await openPanel(page, 'テーブル設定');
  const settings = page.locator('game-table-setting');
  await expect(settings).toBeVisible({ timeout: 10000 });
  await settings.getByTestId('background-layer-add').click();
  await settings.getByTestId('background-layer-placement').first().selectOption('over');
  await settings.getByTestId('background-layer-image').first().click();
  const picker = page.locator('file-selector');
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles([{ ...RED, mimeType: 'image/png' }]);
  await expect(picker).toHaveCount(0);
  return settings;
}

/** A point of the board with nothing standing on it, as the camera puts it on the screen. */
async function bareBoard(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    for (let y = 150; y <= 650; y += 100) {
      for (let x = 150; x <= 850; x += 100) {
        const at = hooks.project(x, y, 0);
        if (!at || at.x < 0 || at.y < 0 || at.x >= innerWidth || at.y >= innerHeight) continue;
        if (hooks.pickAt(at.x, at.y) !== null) continue;
        if (document.elementFromPoint(at.x, at.y)?.closest('[data-object-id], ui-panel')) continue;
        return at;
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  return point!;
}

async function colourAt(page: Page, point: Point): Promise<[number, number, number]> {
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
      const [r, g, b] = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
      return [r, g, b] as [number, number, number];
    },
    { data: shot.toString('base64'), point }
  );
}

test.describe('the layers of a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('draws a layer laid over the board in the scene, and the page draws none of it', async ({ page }) => {
    const point = await bareBoard(page);
    await layOver(page);
    await closePanels(page);

    await expect.poll(async () => (await stats(page))?.layers).toBe(1);
    await expect(page.getByTestId('foreground-layers')).toHaveCount(0);
    await idle(page);
    const [r, g, b] = await colourAt(page, point);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(90);
  });

  test('draws a drifting layer frame after frame, and is still idle once all it was told is drawn', async ({
    page,
  }) => {
    const settings = await layOver(page);
    await settings.getByTestId('background-layer-speed-x').first().fill('120');
    await settings.getByTestId('background-layer-speed-x').first().blur();
    await closePanels(page);
    await expect.poll(async () => (await stats(page))?.layers).toBe(1);

    await idle(page);
    const before = (await stats(page))!.draws;
    await expect.poll(async () => (await stats(page))!.draws, { timeout: 10000 }).toBeGreaterThan(before + 5);
  });
});
