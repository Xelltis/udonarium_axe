import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';
import { showWall } from '../table-face-helpers';

/**
 * The table's grid over a wall of a table drawn on a canvas, which the canvas lays over the wall's
 * picture as the page lays it, cell labels and all.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  faceAt(x: number, y: number): string | null;
};

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 790);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** A picture of the screen, read into the page so its colours can be looked up there. */
async function grabScreen(page: Page): Promise<void> {
  const shot = await page.screenshot({ scale: 'css' });
  await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const kept = (window as unknown as { __shots?: ImageData[] }).__shots ?? [];
    kept.push(canvas.getContext('2d')!.getImageData(0, 0, image.width, image.height));
    (window as unknown as { __shots: ImageData[] }).__shots = kept;
  }, shot.toString('base64'));
}

test.describe('the grid over a wall of a table drawn on a canvas', () => {
  test('is laid over the wall’s picture once the table shows its grid', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await showWall(page, '北壁', 'north');
    await idle(page);
    await grabScreen(page);

    await openPanel(page, 'テーブル設定');
    const shown = page.locator('input[name="tableGridShow"]');
    await expect(shown).not.toBeChecked();
    await shown.check({ force: true });
    await closePanels(page);
    await idle(page);
    await grabScreen(page);

    const onWall = await page.evaluate(() => {
      const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
      const [before, after] = (window as unknown as { __shots: ImageData[] }).__shots.slice(-2);
      const layer = document.querySelector('#app-table-layer')!;
      const result = { wall: 0, changed: 0 };
      for (let y = 20; y < innerHeight / 2; y += 3) {
        for (let x = 20; x < innerWidth - 20; x += 3) {
          const front = document.elementFromPoint(x, y);
          if (!front || !layer.contains(front) || front.closest('[data-object-id]')) continue;
          if (hooks.faceAt(x, y) !== 'north-wall') continue;
          result.wall++;
          const at = (y * before.width + x) * 4;
          if (Math.max(...[0, 1, 2].map((c) => Math.abs(before.data[at + c] - after.data[at + c]))) > 12)
            result.changed++;
        }
      }
      return result;
    });
    expect(onWall.wall, 'points of the north wall on the screen').toBeGreaterThan(500);
    expect(onWall.changed / onWall.wall, JSON.stringify(onWall)).toBeGreaterThan(0.03);
  });
});
