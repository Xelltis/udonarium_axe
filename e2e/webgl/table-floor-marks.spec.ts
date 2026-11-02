import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createCharacter, waitAppReady } from '../helpers';
import { askForStrictMoves, openMove } from '../move-helpers';

/**
 * What the page paints on the floor of a table drawn on a canvas, as the reach of a move: the
 * canvas lays the page's painting over its board, and takes it up again when the page stops.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { floorCanvases: number } | null;
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

function floorCanvases(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.floorCanvases ?? -1);
}

test.describe('marks painted on the floor of a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await askForStrictMoves(page);
    await closePanels(page);
    await idle(page);
  });

  test('lays the reach of a move on the board, beside the piece, and takes it up once the move is given up', async ({
    page,
  }) => {
    expect(await floorCanvases(page)).toBe(0);
    const piece = (await page.locator('game-character').first().boundingBox())!;
    const beside = { x: piece.x + piece.width + 4, y: piece.y + piece.height - 16, width: 16, height: 12 };
    const bare = await page.screenshot({ clip: beside });
    expect(await page.screenshot({ clip: beside }), 'nothing moves beside the piece before the move').toEqual(bare);

    await openMove(page);
    await expect(page.locator('[data-testid="move-plan-hint"]')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => floorCanvases(page)).toBeGreaterThan(0);
    await expect(page.locator('table-move-range-overlay canvas').first()).toHaveClass(/opacity-0/);
    await idle(page);
    expect(await page.screenshot({ clip: beside }), 'the reach is drawn beside the piece').not.toEqual(bare);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="move-plan-hint"]')).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => floorCanvases(page)).toBe(0);
  });
});
