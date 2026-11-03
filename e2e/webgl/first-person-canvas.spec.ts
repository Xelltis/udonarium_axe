import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { openFabMenu, waitAppReady } from '../helpers';

/**
 * Dungeondry Master mode on a table drawn on a canvas: the table's own scene, seen from the eye of
 * the piece, on the canvas the table lends the view, with the piece itself left out of it, and the
 * canvas handed back to the table once the view closes.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { sprites: number; draws: number } | null;
};

function stats(page: Page): Promise<{ sprites: number; draws: number }> {
  return page.evaluate(
    () => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats() ?? { sprites: -1, draws: -1 }
  );
}

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** How many points of a grid over the canvas are drawn on at all, read off a picture of the page. */
async function drawnPoints(page: Page): Promise<number> {
  const box = (await page.getByTestId('table-scene').boundingBox())!;
  const shot = await page.screenshot({ scale: 'css', clip: box });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    let drawn = 0;
    for (let y = 8; y < image.height; y += 16) {
      for (let x = 8; x < image.width; x += 16) {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        if (r + g + b > 30) drawn++;
      }
    }
    return drawn;
  }, shot.toString('base64'));
}

test.describe('Dungeondry Master mode on a table drawn on a canvas', () => {
  test('draws the table’s scene from the eye on the canvas the table lends it, without the piece looked out of', async ({
    page,
  }) => {
    await waitAppReady(page);
    await closePanels(page);
    await idle(page);

    await openFabMenu(page);
    const submenu = page.getByTestId('fab-submenu-table');
    if (!(await submenu.isVisible())) await page.getByTestId('fab-entry-table').click();
    await page.getByTestId('fab-entry-firstPersonView').click();
    await page.locator('context-menu').last().locator('li').first().click();
    const view = page.locator('first-person-view');
    await expect(view.getByTestId('first-person-canvas').getByTestId('table-scene')).toBeAttached({ timeout: 10000 });
    await expect(view.locator('[data-quad]')).toHaveCount(0);
    await idle(page);
    const fromTheEye = (await stats(page)).sprites;
    expect(await drawnPoints(page)).toBeGreaterThan(50);

    const drawn = (await stats(page)).draws;
    await page.keyboard.press('e');
    await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(drawn);

    await page.keyboard.press('Escape');
    await expect(view).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('game-table').getByTestId('table-scene')).toBeAttached();
    await idle(page);
    expect((await stats(page)).sprites).toBeGreaterThan(fromTheEye);
  });
});
