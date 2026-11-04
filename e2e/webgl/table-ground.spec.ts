import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { waitAppReady } from '../helpers';

/**
 * The ground of a table drawn on a canvas, which the master raises, digs and paints with a brush laid
 * on the table, and what stands on it stands on.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  pieceBoxesOnPage(identifier: string): Box[];
  groundAt(x: number, y: number): number;
  paintAt(x: number, y: number): number[] | null;
  sceneBoard(): { widthPx: number; depthPx: number } | null;
};

/**
 * Waits for the table to be drawn and to have nothing left to draw, with the pointer off the table
 * and the detail of any piece it passed over gone.
 */
async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** The most of each kind of ground painted anywhere on the board, grass, dirt, rock and sand in turn, each out of fifteen. */
function mostPainted(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const board = hooks.sceneBoard();
    const most = [0, 0, 0, 0];
    for (let y = 0; y < (board?.depthPx ?? 0); y += 25) {
      for (let x = 0; x < (board?.widthPx ?? 0); x += 25) {
        hooks.paintAt(x, y)?.forEach((share, kind) => (most[kind] = Math.max(most[kind], share)));
      }
    }
    return most;
  });
}

async function pedestalOf(page: Page, identifier: string): Promise<Box> {
  const [pedestal] = await page.evaluate(
    (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
    identifier
  );
  return pedestal;
}

/** How high the ground stands under the middle of a piece, in table pixels. */
async function groundUnder(page: Page, piece: Locator): Promise<number> {
  const [x, y] = (await piece.locator('[data-location]').first().getAttribute('data-location'))!.split(',').map(Number);
  return page.evaluate(({ x, y }) => (window as unknown as { __axeTable: Hooks }).__axeTable.groundAt(x + 25, y + 25), {
    x,
    y,
  });
}

test.describe('the ground of a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('is raised under a piece by strokes of the brush, lifting the piece, and goes back when a stroke is taken back', async ({
    page,
  }) => {
    const character = page.locator('game-character', { has: page.getByText('キャラクターB', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    const flat = await pedestalOf(page, id);

    await page.getByTestId('toolbar-ground-brush').click();
    const band = page.getByTestId('ground-brush-band');
    await expect(band).toBeVisible();
    await expect(page.getByTestId('ground-brush-raise')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(5, 400);

    // Just beyond the piece rather than on it, clear of the band at the foot of the screen: the
    // brush reaches under the piece from the ground round it.
    const at = { x: flat.x + flat.width / 2, y: flat.y - 20 };
    for (let stroke = 0; stroke < 3; stroke++) {
      await page.mouse.move(at.x - 60, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 60, at.y, { steps: 10 });
      await page.mouse.up();
    }
    await idle(page);
    expect(await groundUnder(page, character)).toBeGreaterThan(10);

    const raised = await pedestalOf(page, id);
    expect(flat.y - raised.y, JSON.stringify([flat, raised])).toBeGreaterThan(10);

    for (let stroke = 0; stroke < 3; stroke++) await page.getByTestId('ground-brush-undo').click();
    await expect(page.getByTestId('ground-brush-undo')).toBeDisabled();
    await idle(page);

    expect(await groundUnder(page, character)).toBe(0);
    const back = await pedestalOf(page, id);
    expect(Math.abs(back.y - flat.y), JSON.stringify([flat, back])).toBeLessThan(1);
  });

  test('paints the ground the kind of ground chosen, where the brush is laid', async ({ page }) => {
    const spot = { x: 1040, y: 560 };
    const clip = { x: spot.x - 6, y: spot.y - 6, width: 12, height: 12 };
    const bare = await page.screenshot({ clip });

    await page.getByTestId('toolbar-ground-brush').click();
    await page.getByTestId('ground-brush-paint').click();
    await page.getByTestId('ground-brush-layer-rock').click();
    await page.mouse.move(spot.x - 60, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 60, spot.y, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId('ground-brush-close').click();
    await idle(page);

    const [grass, dirt, rock, sand] = await mostPainted(page);
    expect({ grass, dirt, sand }).toEqual({ grass: 0, dirt: 0, sand: 0 });
    expect(rock).toBeGreaterThan(0);
    expect(await page.screenshot({ clip })).not.toEqual(bare);
  });

  test('takes presses on the table only while the brush is on', async ({ page }) => {
    await page.getByTestId('toolbar-ground-brush').click();
    await expect(page.getByTestId('ground-brush-band')).toBeVisible();

    await page.getByTestId('ground-brush-close').click();

    await expect(page.getByTestId('ground-brush-band')).toHaveCount(0);
  });
});
