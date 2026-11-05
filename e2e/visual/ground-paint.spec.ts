import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels, drawsOnCanvas, freeze, prepare, settle, snap } from './fixtures';

type Hooks = {
  whenIdle(): Promise<void>;
  paintAt(x: number, y: number): number[] | null;
  sceneBoard(): { widthPx: number; depthPx: number } | null;
};

/** The kinds of ground the brush paints, each laid in a band of its own across the board, top to bottom. */
const BANDS = [
  { layer: 'grass', y: 190 },
  { layer: 'dirt', y: 310 },
  { layer: 'rock', y: 430 },
  { layer: 'sand', y: 550 },
] as const;

/** Which of the four kinds of ground are painted anywhere on the board, grass, dirt, rock and sand in turn. */
function kindsPainted(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const board = hooks.sceneBoard();
    const found = [false, false, false, false];
    for (let y = 0; y < (board?.depthPx ?? 0); y += 25) {
      for (let x = 0; x < (board?.widthPx ?? 0); x += 25) {
        hooks.paintAt(x, y)?.forEach((share, kind) => (found[kind] ||= share > 0));
      }
    }
    return found;
  });
}

/**
 * Ground painted with each of its four kinds, a band of each across the board, which the canvas draws
 * with the pictures of grass, dirt, rock and sand tiled across it and blended at the edges of a band.
 * The page's own table draws no paint, so only the canvas is pictured. The brush is laid with the
 * page's clock running, as the band it is chosen on comes in on demand, and the clock is held once the
 * table has drawn what was painted.
 */
test('painted ground wears the picture of each kind of ground', async ({ page }) => {
  test.skip(!drawsOnCanvas(), 'the page’s own table draws no paint');
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);

  await page.getByTestId('toolbar-ground-brush').click();
  await page.getByTestId('ground-brush-paint').click();
  await page.getByTestId('ground-brush-strength').fill('1');
  for (const band of BANDS) {
    await page.getByTestId(`ground-brush-layer-${band.layer}`).click();
    await page.mouse.move(260, band.y);
    await page.mouse.down();
    await page.mouse.move(980, band.y, { steps: 24 });
    await page.mouse.up();
  }
  await page.getByTestId('ground-brush-close').click();
  await expect(page.getByTestId('ground-brush-band')).toHaveCount(0);
  await expect.poll(() => kindsPainted(page)).toEqual([true, true, true, true]);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
  await freeze(page);
  await settle(page, 100);

  await snap(page, 'ground-paint');
});
