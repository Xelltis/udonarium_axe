import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { boxGlb } from '../glb-helpers';
import { waitAppReady } from '../helpers';

/**
 * The 3D models a table drawn on a canvas draws a piece as, in place of its picture: read from a
 * `.glb` file chosen in the piece's sheet, stood where the piece stands, and taken away again. A
 * model that needs no decoder fetches none.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { models: number; draws: number } | null;
  pieceBoxesOnPage(identifier: string): Box[];
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

function models(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.models ?? -1);
}

/** How many points round the middle of a box on the screen are of a colour, read off a picture of it. */
async function pointsOfColour(page: Page, box: Box, rgb: [number, number, number]): Promise<number> {
  const shot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ data, box, rgb }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      let found = 0;
      for (let y = box.y; y < box.y + box.height; y += 4) {
        for (let x = box.x; x < box.x + box.width; x += 4) {
          const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
          const hue = (r - g) * Math.sign(rgb[0] - rgb[1]) + (r - b) * Math.sign(rgb[0] - rgb[2]);
          if (hue > 120) found++;
        }
      }
      return found;
    },
    { data: shot.toString('base64'), box, rgb }
  );
}

test.describe('the 3D models of a table drawn on a canvas', () => {
  test('draws a piece as the model read for it in its sheet, and as its picture again once it has none', async ({
    page,
  }) => {
    const fetched: string[] = [];
    page.on('request', (request) => fetched.push(request.url()));
    await waitAppReady(page);
    await closePanels(page);
    await idle(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    const identifier = (await piece.getAttribute('data-object-id'))!;
    const red: [number, number, number] = [230, 20, 20];
    const box = (
      await page.evaluate(
        (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
        identifier
      )
    )[0];
    const before = await pointsOfColour(page, box, red);

    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.locator('button:has(i:text-is("settings"))').first().click();
    await sheet
      .getByTestId('piece-model-file')
      .setInputFiles({ name: 'red-box.glb', mimeType: 'model/gltf-binary', buffer: boxGlb(1, 2, red) });
    await expect(sheet.getByTestId('piece-model')).not.toHaveValue('');
    await expect.poll(() => models(page)).toBe(1);
    expect(fetched.filter((url) => url.includes('/assets/decoders/') || /(DRACO|KTX2)Loader/.test(url))).toEqual([]);
    await closePanels(page);
    await idle(page);
    expect(await pointsOfColour(page, box, red)).toBeGreaterThan(before + 10);

    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    await sheet.locator('button:has(i:text-is("settings"))').first().click();
    await sheet.getByTestId('piece-model').selectOption({ index: 0 });
    await expect.poll(() => models(page)).toBe(0);
  });
});
