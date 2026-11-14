import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels, idleOnCanvas, openPanel, waitAppReady } from '../helpers';
import { solidPng } from '../png-helpers';

/**
 * The pictures a table lays under and over its board, as a table drawn on a canvas draws them: in
 * its own scene, over the board's picture and under everything standing on it, with the page's own
 * drawing of them left out.
 */

type Point = { x: number; y: number };

const RED = { name: 'red-mist.png', buffer: solidPng(400, 60, [220, 30, 30]) };

function stats(page: Page) {
  return page.evaluate(() => window.__axeTable.sceneStats());
}

/** Lays a layer of a red picture over the board from the table's settings. */
async function layOver(page: Page): Promise<void> {
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
}

/** A point of the board with nothing standing on it, as the camera puts it on the screen. */
async function bareBoard(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    const hooks = window.__axeTable;
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
    await idleOnCanvas(page);
  });

  test('draws a layer laid over the board in the scene, and the page draws none of it', async ({ page }) => {
    const point = await bareBoard(page);
    await layOver(page);
    await closePanels(page);

    await expect.poll(async () => (await stats(page))?.layers).toBe(1);
    await expect(page.getByTestId('foreground-layers')).toHaveCount(0);
    await idleOnCanvas(page);
    const [r, g, b] = await colourAt(page, point);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(90);
  });
});
