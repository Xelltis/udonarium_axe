import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';
import { solidPng } from '../png-helpers';

/**
 * The sky a table drawn on a canvas draws past its board where the table asks for one, with the
 * ground running out beyond the board to the horizon in place of the page's background.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { sky: boolean; backdrops: number } | null;
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

function skyShown(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.sky);
}

/** How many pictures laid behind everything the canvas stands round the board. */
function backdrops(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.backdrops);
}

/** The colour of the screen at a point, read off a picture of it. */
async function colourAt(page: Page, x: number, y: number): Promise<number[]> {
  const shot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ data, x, y }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    },
    { data: shot.toString('base64'), x, y }
  );
}

test.describe('the sky over a table drawn on a canvas', () => {
  test('is drawn past the board once the table asks for one, over the page’s background, with a picture laid behind everything stood round the board under it, and none without one', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
    expect(await skyShown(page)).toBe(false);
    const viewport = page.viewportSize()!;
    const past = { x: 60, y: viewport.height - 40 };
    const before = await colourAt(page, past.x, past.y);

    await openPanel(page, 'テーブル設定');
    await page.getByTestId('table-sky-kind').selectOption('clock');
    await closePanels(page);

    await expect.poll(() => skyShown(page)).toBe(true);
    await idle(page);
    const after = await colourAt(page, past.x, past.y);
    expect(Math.max(...after.map((value, index) => Math.abs(value - before[index])))).toBeGreaterThan(20);

    await openPanel(page, 'テーブル設定');
    const settings = page.locator('game-table-setting');
    await settings.getByTestId('background-layer-add').click();
    await settings.getByTestId('background-layer-placement').first().selectOption('backdrop');
    await settings.getByTestId('background-layer-image').first().click();
    const picker = page.locator('file-selector');
    await expect(picker).toBeVisible();
    await picker
      .locator('input[type="file"]')
      .setInputFiles([{ name: 'far-hills.png', mimeType: 'image/png', buffer: solidPng(400, 60, [90, 80, 140]) }]);
    await expect(picker).toHaveCount(0);
    await expect.poll(() => backdrops(page)).toBe(1);

    await page.getByTestId('table-sky-kind').selectOption('');
    await expect.poll(() => backdrops(page)).toBe(0);
  });
});
